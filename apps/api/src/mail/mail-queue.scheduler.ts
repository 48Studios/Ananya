import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Periodically drains the outbound queue.
 *
 * Runs in whichever process hosts the module (API or worker). Claiming is
 * atomic, so several processes draining concurrently is safe.
 */
@Injectable()
export class MailQueueScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailQueueScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly mailService: MailService) {}

  onModuleInit(): void {
    // Tests drive processQueue explicitly; an interval would make them flaky.
    if (process.env.NODE_ENV === 'test') return;

    const intervalMs = Number.parseInt(
      process.env.MAIL_QUEUE_INTERVAL_MS ?? '30000',
      10,
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    this.timer = setInterval(() => {
      void this.mailService.processQueue().catch((error: unknown) => {
        this.logger.error(
          `Mail queue processing failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
