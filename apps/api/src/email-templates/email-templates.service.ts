import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@ananya/database';
import { emailTemplates } from '@ananya/database/schema';
import type { EmailTemplateRecord } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { MailService } from '../mail/mail.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import {
  EMAIL_EVENT_DEFINITIONS,
  allowedVariableNames,
  getEventDefinition,
  urlVariableNames,
} from './template-registry';
import {
  renderEmailContent,
  validateTemplateContent,
} from './template-renderer';
import {
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dtos';

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly mailService: MailService,
    private readonly auditService: SecurityAuditService,
  ) {}

  listTemplates(): Promise<EmailTemplateRecord[]> {
    return db.select().from(emailTemplates).orderBy(emailTemplates.category);
  }

  getVariableRegistry() {
    return EMAIL_EVENT_DEFINITIONS.map((definition) => ({
      eventType: definition.eventType,
      category: definition.category,
      name: definition.name,
      description: definition.description,
      variables: definition.variables,
      sampleSubject: definition.defaultSubject,
      sampleContext: definition.sampleContext,
    }));
  }

  async getTemplate(eventType: string): Promise<EmailTemplateRecord> {
    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.eventType, eventType));

    if (!row) {
      throw new NotFoundException(
        `Email template for event '${eventType}' not found.`,
      );
    }
    return row;
  }

  async updateTemplate(
    eventType: string,
    dto: UpdateEmailTemplateDto,
    userId?: string,
  ): Promise<EmailTemplateRecord> {
    const existing = await this.getTemplate(eventType);
    this.assertValidContent(eventType, dto);

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== existing.version
    ) {
      throw new ConflictException(
        `Template was updated by another user (expected version ${dto.expectedVersion}, current ${existing.version}). Reload before saving.`,
      );
    }

    const [updated] = await db
      .update(emailTemplates)
      .set({
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        isEnabled: dto.isEnabled ?? existing.isEnabled,
        version: existing.version + 1,
        updatedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(emailTemplates.id, existing.id))
      .returning();

    await this.auditService.record({
      action: 'EMAIL_TEMPLATE_UPDATED',
      category: 'Administration',
      userId,
      details: {
        eventType,
        version: updated!.version,
        isEnabled: updated!.isEnabled,
      },
    });

    return updated!;
  }

  previewTemplate(eventType: string, dto: PreviewEmailTemplateDto) {
    const definition = getEventDefinition(eventType);
    if (!definition) {
      throw new NotFoundException(
        `Email template for event '${eventType}' not found.`,
      );
    }
    this.assertValidContent(eventType, dto);

    // Preview always renders with the canonical server-side sample context;
    // client-supplied context values are never trusted.
    return renderEmailContent(
      dto,
      definition.sampleContext,
      urlVariableNames(eventType),
    );
  }

  async sendTestEmail(
    eventType: string,
    dto: TestSendEmailTemplateDto,
    user: { id: string; email: string },
  ) {
    const existing = await this.getTemplate(eventType);

    const content = {
      subject: dto.subject ?? existing.subject,
      bodyHtml: dto.bodyHtml ?? existing.bodyHtml,
      bodyText: dto.bodyText ?? existing.bodyText,
    };
    this.assertValidContent(eventType, content);

    const definition = getEventDefinition(eventType);
    if (!definition) {
      throw new NotFoundException(
        `Email template for event '${eventType}' not found.`,
      );
    }

    const rendered = renderEmailContent(
      content,
      definition.sampleContext,
      urlVariableNames(eventType),
    );

    const result = await this.mailService.sendNow({
      to: user.email,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: `This is a test message sent from Ananya ERP settings.\n\n${rendered.text}`,
    });

    await this.auditService.record({
      action: 'EMAIL_TEMPLATE_TEST_SEND',
      category: 'Administration',
      userId: user.id,
      details: { eventType, accepted: result.accepted },
    });

    if (!result.accepted) {
      throw new BadRequestException(
        result.error ??
          'Test email could not be accepted by the mail transport.',
      );
    }

    return { accepted: true, recipient: user.email };
  }

  async restoreDefault(
    eventType: string,
    userId?: string,
  ): Promise<EmailTemplateRecord> {
    const existing = await this.getTemplate(eventType);
    const definition = getEventDefinition(eventType);
    if (!definition) {
      throw new NotFoundException(
        `Email template for event '${eventType}' not found.`,
      );
    }

    const [updated] = await db
      .update(emailTemplates)
      .set({
        subject: definition.defaultSubject,
        bodyHtml: definition.defaultBodyHtml,
        bodyText: definition.defaultBodyText,
        isEnabled: true,
        version: existing.version + 1,
        updatedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(emailTemplates.id, existing.id))
      .returning();

    await this.auditService.record({
      action: 'EMAIL_TEMPLATE_RESTORED',
      category: 'Administration',
      userId,
      details: { eventType, version: updated!.version },
    });

    return updated!;
  }

  private assertValidContent(
    eventType: string,
    content: { subject: string; bodyHtml: string; bodyText: string },
  ): void {
    const result = validateTemplateContent(
      content,
      allowedVariableNames(eventType),
    );
    if (!result.valid) {
      throw new BadRequestException(result.errors.join(' '));
    }
  }
}
