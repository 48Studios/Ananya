import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { db } from '@ananya/database';
import { emailOutbox } from '@ananya/database/schema';
import type { EmailOutboxRecord } from '@ananya/database/schema';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  lte,
  sql,
} from '@ananya/database/query';
import type { MailConfig } from './mail.config';
import { sanitizeMailError } from './mail.config';
import type { MailTransport } from './mail.types';

export const MAIL_TRANSPORT = 'MAIL_TRANSPORT';
export const MAIL_CONFIG = 'MAIL_CONFIG';
export const MAIL_CONFIG_ERRORS = 'MAIL_CONFIG_ERRORS';

export const EMAIL_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export interface EnqueueMailInput {
  eventType: string;
  to: string;
  userId?: string | null;
  subject: string;
  html: string;
  text: string;
  sourceType?: string;
  sourceId?: string;
  maxAttempts?: number;
}

export interface ProcessQueueSummary {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

const SENDING_STALE_MINUTES = 10;
const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 3_600_000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(MAIL_CONFIG) private readonly config: MailConfig,
    @Optional()
    @Inject(MAIL_CONFIG_ERRORS)
    private readonly configErrors: string[] = [],
  ) {}

  onModuleInit(): void {
    if (this.configErrors.length > 0) {
      // Errors name variables and shapes only; credentials are never included.
      this.logger.error(
        `Mail configuration is invalid, outbound email is disabled: ${this.configErrors.join(' ')}`,
      );
      return;
    }
    this.logger.log(
      `Mail subsystem ready transport=${this.transport.name} enabled=${this.isEnabled()} from=${this.config.from}`,
    );
  }

  isEnabled(): boolean {
    return this.config.enabled && this.configErrors.length === 0;
  }

  getStatus(): {
    enabled: boolean;
    transport: string;
    from: string;
    replyTo?: string;
    configErrors: string[];
  } {
    return {
      enabled: this.isEnabled(),
      transport: this.transport.name,
      from: this.config.from,
      replyTo: this.config.replyTo,
      configErrors: [...this.configErrors],
    };
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return {
        ok: false,
        error:
          this.configErrors.length > 0
            ? this.configErrors.join(' ')
            : 'Mail is disabled (MAIL_ENABLED is not true).',
      };
    }
    return this.transport.verify();
  }

  /**
   * Sends a message immediately, bypassing the queue. Used only for admin
   * test-sends, where the caller must see the transport outcome directly.
   */
  async sendNow(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ accepted: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return {
        accepted: false,
        error:
          this.configErrors.length > 0
            ? this.configErrors.join(' ')
            : 'Mail is disabled (MAIL_ENABLED is not true).',
      };
    }

    const result = await this.transport.send({
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: this.config.replyTo,
    });

    return {
      accepted: result.accepted,
      error: result.accepted ? undefined : sanitizeMailError(result.error),
    };
  }

  /**
   * Queues a message for delivery. Returns null when mail is disabled or the
   * recipient has no address, so callers never observe a fake success.
   */
  async enqueue(input: EnqueueMailInput): Promise<EmailOutboxRecord | null> {
    const to = input.to?.trim();
    if (!this.isEnabled()) {
      return null;
    }
    if (!to) {
      return null;
    }

    const [row] = await db
      .insert(emailOutbox)
      .values({
        eventType: input.eventType,
        recipientEmail: to,
        recipientUserId: input.userId ?? null,
        subject: input.subject.slice(0, 500),
        bodyHtml: input.html,
        bodyText: input.text,
        status: 'QUEUED',
        attempts: 0,
        maxAttempts: input.maxAttempts ?? this.config.maxAttempts,
        nextAttemptAt: new Date(),
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
      })
      .returning();

    return row ?? null;
  }

  /**
   * Claims and delivers queued messages.
   *
   * Rows are locked with `FOR UPDATE SKIP LOCKED` and marked SENDING before any
   * network call, so concurrent API/worker processes cannot send the same row
   * twice. A crashed process leaves SENDING rows, which are requeued after a
   * staleness window.
   */
  async processQueue(limit = 20): Promise<ProcessQueueSummary> {
    const summary: ProcessQueueSummary = {
      claimed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      skipped: 0,
    };

    await this.requeueStaleSending();

    if (!this.isEnabled()) {
      const [pending] = await db
        .select({ total: count() })
        .from(emailOutbox)
        .where(eq(emailOutbox.status, 'QUEUED'));
      if (Number(pending?.total ?? 0) > 0) {
        await db
          .update(emailOutbox)
          .set({
            status: 'SKIPPED',
            lastError: 'Mail is disabled or misconfigured.',
            updatedAt: new Date(),
          })
          .where(eq(emailOutbox.status, 'QUEUED'));
      }
      summary.skipped = Number(pending?.total ?? 0);
      return summary;
    }

    const claimed = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.status, 'QUEUED'),
            lte(emailOutbox.nextAttemptAt, new Date()),
          ),
        )
        .orderBy(emailOutbox.createdAt)
        .limit(limit)
        .for('update', { skipLocked: true });

      if (rows.length === 0) return [];

      await tx
        .update(emailOutbox)
        .set({ status: 'SENDING', updatedAt: new Date() })
        .where(
          inArray(
            emailOutbox.id,
            rows.map((row) => row.id),
          ),
        );

      return rows;
    });

    summary.claimed = claimed.length;

    for (const row of claimed) {
      const result = await this.transport.send({
        to: row.recipientEmail,
        subject: row.subject,
        html: row.bodyHtml,
        text: row.bodyText,
        replyTo: this.config.replyTo,
      });

      if (result.accepted) {
        await db
          .update(emailOutbox)
          .set({
            status: 'SENT',
            attempts: row.attempts + 1,
            providerMessageId: result.providerMessageId ?? null,
            lastError: null,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailOutbox.id, row.id));
        summary.sent += 1;
        continue;
      }

      const attempts = row.attempts + 1;
      const terminal = attempts >= row.maxAttempts;
      const errorText = sanitizeMailError(result.error);

      await db
        .update(emailOutbox)
        .set({
          status: terminal ? 'FAILED' : 'QUEUED',
          attempts,
          lastError: errorText,
          nextAttemptAt: terminal
            ? row.nextAttemptAt
            : new Date(Date.now() + this.retryDelayMs(attempts)),
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));

      if (terminal) {
        summary.failed += 1;
        this.logger.error(
          `Mail delivery failed permanently for outbox ${row.id} (${row.eventType}): ${errorText}`,
        );
      } else {
        summary.retried += 1;
      }
    }

    return summary;
  }

  async listOutbox(options?: {
    status?: EmailStatus;
    limit?: number;
  }): Promise<EmailOutboxRecord[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const query = db.select().from(emailOutbox);
    const rows = options?.status
      ? await query
          .where(eq(emailOutbox.status, options.status))
          .orderBy(desc(emailOutbox.createdAt))
          .limit(limit)
      : await query.orderBy(desc(emailOutbox.createdAt)).limit(limit);
    return rows;
  }

  async getOutboxCounts(): Promise<Record<string, number>> {
    const rows = await db
      .select({ status: emailOutbox.status, total: count() })
      .from(emailOutbox)
      .groupBy(emailOutbox.status);

    const counts: Record<string, number> = {};
    for (const status of EMAIL_STATUSES) counts[status] = 0;
    for (const row of rows) counts[row.status] = Number(row.total);
    return counts;
  }

  private retryDelayMs(attempts: number): number {
    const delay = BASE_RETRY_DELAY_MS * 2 ** Math.max(attempts - 1, 0);
    return Math.min(delay, MAX_RETRY_DELAY_MS);
  }

  private async requeueStaleSending(): Promise<void> {
    await db
      .update(emailOutbox)
      .set({ status: 'QUEUED', updatedAt: new Date() })
      .where(
        and(
          eq(emailOutbox.status, 'SENDING'),
          sql`${emailOutbox.updatedAt} < now() - interval '${sql.raw(String(SENDING_STALE_MINUTES))} minutes'`,
        ),
      );
  }
}
