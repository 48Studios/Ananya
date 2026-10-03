import { redactSensitiveData } from '../common/utils/sensitive-data-redactor';

export type MailTransportKind = 'smtp' | 'log';

export interface MailConfig {
  enabled: boolean;
  transport: MailTransportKind;
  from: string;
  replyTo?: string;
  maxAttempts: number;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    timeoutMs: number;
  };
}

export interface MailConfigResolution {
  config: MailConfig;
  errors: string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseIntInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Resolves mail configuration from the environment.
 *
 * Returns validation errors instead of throwing so startup can log a precise
 * reason and keep serving with mail disabled. Error messages never contain the
 * SMTP password; only variable names and shape problems are reported.
 */
export function resolveMailConfig(
  env: NodeJS.ProcessEnv = process.env,
): MailConfigResolution {
  const errors: string[] = [];
  const enabled = parseBoolean(env.MAIL_ENABLED, false);

  const rawTransport = (env.MAIL_TRANSPORT ?? 'log').trim().toLowerCase();
  const transport: MailTransportKind = rawTransport === 'smtp' ? 'smtp' : 'log';
  if (rawTransport !== 'smtp' && rawTransport !== 'log') {
    errors.push(
      `MAIL_TRANSPORT must be 'smtp' or 'log' (received '${rawTransport}').`,
    );
  }

  const from = (env.MAIL_FROM ?? '').trim();
  const replyTo = (env.MAIL_REPLY_TO ?? '').trim();
  if (enabled) {
    if (!from) {
      errors.push('MAIL_FROM is required when MAIL_ENABLED=true.');
    } else if (!EMAIL_PATTERN.test(from)) {
      errors.push('MAIL_FROM must be a valid email address.');
    }
    if (replyTo && !EMAIL_PATTERN.test(replyTo)) {
      errors.push('MAIL_REPLY_TO must be a valid email address when set.');
    }
  }

  const smtpUser = (env.SMTP_USER ?? '').trim();
  const smtpPassword = env.SMTP_PASSWORD ?? '';
  const smtp = {
    host: (env.SMTP_HOST ?? '').trim(),
    port: parseIntInRange(env.SMTP_PORT, 587, 1, 65535),
    secure: parseBoolean(env.SMTP_SECURE, false),
    user: smtpUser || undefined,
    password: smtpPassword || undefined,
    timeoutMs: parseIntInRange(env.SMTP_TIMEOUT_MS, 10000, 1000, 60000),
  };

  if (enabled && transport === 'smtp') {
    if (!smtp.host) {
      errors.push('SMTP_HOST is required when MAIL_TRANSPORT=smtp.');
    }
    if ((smtpUser && !smtpPassword) || (!smtpUser && smtpPassword)) {
      errors.push('SMTP_USER and SMTP_PASSWORD must be configured together.');
    }
  }

  return {
    config: {
      enabled,
      transport,
      from: from || 'no-reply@ananya.local',
      replyTo: replyTo || undefined,
      maxAttempts: parseIntInRange(env.MAIL_MAX_ATTEMPTS, 3, 1, 10),
      smtp,
    },
    errors,
  };
}

/**
 * Error text safe to persist and display: single line, bounded, credentials
 * masked. SMTP errors can echo connection strings or auth details.
 */
export function sanitizeMailError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown mail transport error';

  const singleLine = raw.replace(/\s+/g, ' ').trim();
  const redacted = redactSensitiveData(singleLine);
  return (redacted || 'Unknown mail transport error').slice(0, 900);
}
