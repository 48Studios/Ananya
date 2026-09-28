import { redactSensitiveData } from './sensitive-data-redactor';

describe('redactSensitiveData', () => {
  it('redacts password and credential fields in plain objects', () => {
    const input = {
      email: 'admin@example.com',
      password: 'superSecretPassword',
      newPassword: 'anotherSecretPassword',
      passwordConfirm: 'superSecretPassword',
      secretApiKey: 'sk_live_123456789',
    };

    const sanitized = redactSensitiveData(input);

    expect(sanitized.email).toBe('admin@example.com');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.newPassword).toBe('[REDACTED]');
    expect(sanitized.passwordConfirm).toBe('[REDACTED]');
    expect(sanitized.secretApiKey).toBe('[REDACTED]');
  });

  it('redacts raw tokens and authorization headers while preserving non-secret metadata', () => {
    const input = {
      userId: 'usr-1234',
      userEmail: 'user@example.com',
      token: 'raw_bearer_session_token_xyz',
      sessionToken: 'session_token_abc',
      authorization: 'Bearer raw_bearer_session_token_xyz',
      cookie: 'session=xyz123',
      tokenFingerprint: 'a1b2c3d4',
      statusCode: 200,
    };

    const sanitized = redactSensitiveData(input);

    expect(sanitized.userId).toBe('usr-1234');
    expect(sanitized.userEmail).toBe('user@example.com');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.sessionToken).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized.tokenFingerprint).toBe('a1b2c3d4');
    expect(sanitized.statusCode).toBe(200);
  });

  it('redacts database URI connection credentials in string fields', () => {
    const input = {
      connectionUrl:
        'postgresql://postgres:myDbPassword123@localhost:5432/ananya_db',
    };

    const sanitized = redactSensitiveData(input);
    expect(sanitized.connectionUrl).toBe(
      'postgresql://postgres:[REDACTED]@localhost:5432/ananya_db',
    );
  });

  it('recursively redacts nested objects and arrays', () => {
    const input = {
      request: {
        headers: {
          authorization: 'Bearer secret_token',
        },
        body: [
          { field: 'normal', value: 123 },
          { field: 'sensitive', password: 'secret' },
        ],
      },
    };

    const sanitized = redactSensitiveData(input);
    expect(sanitized.request.headers.authorization).toBe('[REDACTED]');
    expect(sanitized.request.body[0].value).toBe(123);
    expect(sanitized.request.body[1].password).toBe('[REDACTED]');
  });

  it('handles null, undefined and primitives safely', () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
    expect(redactSensitiveData('plain string')).toBe('plain string');
    expect(redactSensitiveData(42)).toBe(42);
    expect(redactSensitiveData(true)).toBe(true);
  });
});
