import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { MailConfig } from '../mail.config';
import { sanitizeMailError } from '../mail.config';
import type { MailMessage, MailSendResult, MailTransport } from '../mail.types';

/**
 * SMTP transport backed by nodemailer.
 *
 * The transporter is created once with explicit timeouts so a dead SMTP server
 * cannot hang a request. Credentials never appear in logs or results.
 */
@Injectable()
export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp';

  private readonly logger = new Logger(SmtpMailTransport.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: MailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.password
          ? { user: config.smtp.user, pass: config.smtp.password }
          : undefined,
      connectionTimeout: config.smtp.timeoutMs,
      greetingTimeout: config.smtp.timeoutMs,
      socketTimeout: config.smtp.timeoutMs,
    });

    this.logger.log(
      `SMTP transport configured host=${config.smtp.host} port=${config.smtp.port} secure=${config.smtp.secure} auth=${Boolean(config.smtp.user)}`,
    );
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo ?? this.config.replyTo,
      });

      const acceptedCount = Array.isArray(info.accepted)
        ? info.accepted.length
        : 0;

      return {
        accepted: acceptedCount > 0,
        providerMessageId: info.messageId ?? undefined,
        error:
          acceptedCount > 0
            ? undefined
            : 'SMTP server rejected every recipient address',
      };
    } catch (error: unknown) {
      return { accepted: false, error: sanitizeMailError(error) };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, error: sanitizeMailError(error) };
    }
  }
}
