import { resolveMailConfig, sanitizeMailError } from './mail.config';

describe('resolveMailConfig', () => {
  it('defaults to disabled log transport without errors', () => {
    const { config, errors } = resolveMailConfig({});

    expect(errors).toEqual([]);
    expect(config.enabled).toBe(false);
    expect(config.transport).toBe('log');
    expect(config.maxAttempts).toBe(3);
  });

  it('requires MAIL_FROM when mail is enabled', () => {
    const { errors } = resolveMailConfig({ MAIL_ENABLED: 'true' });

    expect(errors).toContainEqual(
      expect.stringContaining('MAIL_FROM is required'),
    );
  });

  it('rejects a malformed MAIL_FROM', () => {
    const { errors } = resolveMailConfig({
      MAIL_ENABLED: 'true',
      MAIL_FROM: 'not-an-email',
    });

    expect(errors).toContainEqual(
      expect.stringContaining('MAIL_FROM must be a valid email'),
    );
  });

  it('requires SMTP_HOST for the smtp transport', () => {
    const { errors } = resolveMailConfig({
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'alerts@ananya.test',
    });

    expect(errors).toContainEqual(
      expect.stringContaining('SMTP_HOST is required'),
    );
  });

  it('requires SMTP_USER and SMTP_PASSWORD together', () => {
    const { errors } = resolveMailConfig({
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'alerts@ananya.test',
      SMTP_HOST: 'smtp.ananya.test',
      SMTP_USER: 'mailer',
    });

    expect(errors).toContainEqual(
      expect.stringContaining('SMTP_USER and SMTP_PASSWORD'),
    );
  });

  it('accepts a complete smtp configuration', () => {
    const { config, errors } = resolveMailConfig({
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'alerts@ananya.test',
      MAIL_REPLY_TO: 'ops@ananya.test',
      SMTP_HOST: 'smtp.ananya.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'super-secret',
      SMTP_TIMEOUT_MS: '5000',
    });

    expect(errors).toEqual([]);
    expect(config.enabled).toBe(true);
    expect(config.transport).toBe('smtp');
    expect(config.replyTo).toBe('ops@ananya.test');
    expect(config.smtp).toMatchObject({
      host: 'smtp.ananya.test',
      port: 465,
      secure: true,
      user: 'mailer',
      timeoutMs: 5000,
    });
  });

  it('clamps invalid ports and timeouts to safe defaults', () => {
    const { config } = resolveMailConfig({
      SMTP_PORT: '99999',
      SMTP_TIMEOUT_MS: '1',
    });

    expect(config.smtp.port).toBe(587);
    expect(config.smtp.timeoutMs).toBe(10000);
  });

  it('flags an unsupported transport value', () => {
    const { errors } = resolveMailConfig({ MAIL_TRANSPORT: 'carrier-pigeon' });

    expect(errors).toContainEqual(
      expect.stringContaining("MAIL_TRANSPORT must be 'smtp' or 'log'"),
    );
  });

  it('never echoes the SMTP password in validation errors', () => {
    const { errors } = resolveMailConfig({
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'alerts@ananya.test',
      SMTP_HOST: 'smtp.ananya.test',
      SMTP_PASSWORD: 'super-secret-password',
    });

    expect(errors.join(' ')).not.toContain('super-secret-password');
  });
});

describe('sanitizeMailError', () => {
  it('collapses multiline errors into one bounded line', () => {
    const message = sanitizeMailError(
      new Error('Connection refused\n  at SMTPClient\n  at Socket'),
    );

    expect(message).not.toContain('\n');
    expect(message).toContain('Connection refused');
  });

  it('masks credentials embedded in connection strings', () => {
    const message = sanitizeMailError(
      new Error('failed to connect smtp://mailer:super-secret@smtp.host:587'),
    );

    expect(message).not.toContain('super-secret');
    expect(message).toContain('[REDACTED]');
  });

  it('bounds very long provider errors', () => {
    const message = sanitizeMailError(new Error('x'.repeat(5000)));

    expect(message.length).toBeLessThanOrEqual(900);
  });

  it('handles non-Error values without leaking objects', () => {
    expect(sanitizeMailError(undefined)).toBe('Unknown mail transport error');
    expect(sanitizeMailError({ password: 'nope' })).toBe(
      'Unknown mail transport error',
    );
  });
});
