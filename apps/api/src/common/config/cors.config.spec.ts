import { resolveCorsOrigin } from './cors.config';

describe('resolveCorsOrigin', () => {
  it('returns configured single origin string', () => {
    expect(resolveCorsOrigin('production', 'https://erp.example.com')).toBe(
      'https://erp.example.com',
    );
  });

  it('returns configured comma-separated origin array', () => {
    expect(
      resolveCorsOrigin(
        'production',
        'https://erp.example.com, https://admin.example.com',
      ),
    ).toEqual(['https://erp.example.com', 'https://admin.example.com']);
  });

  it('fails closed (returns false) in production when no CORS_ORIGIN is set', () => {
    expect(resolveCorsOrigin('production', undefined)).toBe(false);
    expect(resolveCorsOrigin('production', '')).toBe(false);
    expect(resolveCorsOrigin('production', '   ')).toBe(false);
  });

  it('returns localhost development origins when not in production and no origin configured', () => {
    const devOrigins = resolveCorsOrigin('development', undefined);
    expect(Array.isArray(devOrigins)).toBe(true);
    expect(devOrigins).toContain('http://localhost:3000');
    expect(devOrigins).toContain('http://127.0.0.1:3000');
  });
});
