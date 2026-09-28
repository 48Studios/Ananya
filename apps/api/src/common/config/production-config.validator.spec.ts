import { validateEnvironmentConfig } from './production-config.validator';

describe('validateEnvironmentConfig', () => {
  it('permits development/test environment without throwing even if DATABASE_URL is unset', () => {
    const result = validateEnvironmentConfig({
      NODE_ENV: 'development',
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
  });

  it('fails fast and throws Error in production when DATABASE_URL is missing', () => {
    expect(() => {
      validateEnvironmentConfig({
        NODE_ENV: 'production',
      });
    }).toThrow(/DATABASE_URL is not set/);
  });

  it('fails fast in production when DATABASE_URL uses insecure default passwords', () => {
    expect(() => {
      validateEnvironmentConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:password@localhost:5432/ananya',
        CORS_ORIGIN: 'https://erp.48studios.com',
      });
    }).toThrow(/default or insecure database password/);
  });

  it('fails fast in production when CORS_ORIGIN is wildcard *', () => {
    expect(() => {
      validateEnvironmentConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:dTd1Ii43r9Q9@db.prod.internal:5432/ananya',
        CORS_ORIGIN: '*',
      });
    }).toThrow(/CORS_ORIGIN cannot be wildcard/);
  });

  it('passes in production with valid non-default credentials and explicit CORS_ORIGIN', () => {
    const result = validateEnvironmentConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://ananya_user:StrongSecretPass987!@db.internal:5432/ananya',
      CORS_ORIGIN: 'https://erp.48studios.com',
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('never leaks secret values in error messages', () => {
    const secretPassword = 'SUPER_SECRET_LEAK_TEST_PASSWORD';
    try {
      validateEnvironmentConfig({
        NODE_ENV: 'production',
        DATABASE_URL: `postgresql://postgres:password@localhost:5432/${secretPassword}`,
      });
      fail('Expected validation error');
    } catch (err: any) {
      expect(err.message).not.toContain(secretPassword);
    }
  });
});
