/**
 * Resolves allowed CORS origins securely.
 * Never pairs wildcard origin reflection with credentials in production.
 */
export function resolveCorsOrigin(
  nodeEnv?: string,
  configuredOrigin?: string,
): boolean | string | string[] {
  if (configuredOrigin && configuredOrigin.trim() !== '') {
    const origins = configuredOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return origins.length === 1 ? (origins[0] ?? false) : origins;
  }

  // In production, fail closed if no explicit CORS_ORIGIN is specified
  if (nodeEnv === 'production') {
    return false;
  }

  // In development and testing, permit local frontend development origins
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
}
