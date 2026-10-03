export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/**
 * Result of handing a message to a provider.
 *
 * `accepted` means the provider (or SMTP server) took responsibility for the
 * message. It is not a delivery receipt: SMTP cannot confirm inbox placement,
 * so nothing in this subsystem reports "delivered".
 */
export interface MailSendResult {
  accepted: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface MailTransport {
  readonly name: string;
  send(message: MailMessage): Promise<MailSendResult>;
  verify(): Promise<{ ok: boolean; error?: string }>;
}
