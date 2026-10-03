import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailSendResult, MailTransport } from '../mail.types';

export interface CapturedMail extends MailMessage {
  capturedAt: Date;
}

/**
 * Non-delivering transport for development and tests.
 *
 * It records messages in memory so behaviour can be asserted without an SMTP
 * server, and logs only the recipient/subject — never the body or headers.
 */
@Injectable()
export class LogMailTransport implements MailTransport {
  readonly name = 'log';

  private readonly logger = new Logger(LogMailTransport.name);
  private readonly captured: CapturedMail[] = [];
  private readonly captureLimit = 50;

  send(message: MailMessage): Promise<MailSendResult> {
    this.captured.push({ ...message, capturedAt: new Date() });
    if (this.captured.length > this.captureLimit) {
      this.captured.shift();
    }

    this.logger.log(
      `[mail:log] accepted message to=${message.to} subject="${message.subject}"`,
    );
    return Promise.resolve({
      accepted: true,
      providerMessageId: `log-${Date.now()}-${this.captured.length}`,
    });
  }

  verify(): Promise<{ ok: boolean; error?: string }> {
    return Promise.resolve({ ok: true });
  }

  /** Test-only view of what this transport accepted. */
  getCaptured(): CapturedMail[] {
    return [...this.captured];
  }

  clearCaptured(): void {
    this.captured.length = 0;
  }
}
