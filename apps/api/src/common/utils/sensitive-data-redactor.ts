/**
 * Sensitive Data Redactor Utility
 *
 * Recursively scans objects, arrays, and strings to sanitize sensitive credentials,
 * authentication tokens, passwords, and secrets before logging or audit trail persistence.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwordhash/i,
  /newpassword/i,
  /currentpassword/i,
  /passwordconfirm/i,
  /confirmpassword/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /accesstoken/i,
  /refreshtoken/i,
  /sessiontoken/i,
  /resettoken/i,
  /authorization/i,
  /cookie/i,
  /privatekey/i,
];

// Connection string regex to mask user:password@host
const URI_CREDENTIALS_REGEX = /([a-zA-Z][a-zA-Z0-9+-.]*:\/\/[^:]+:)([^@]+)(@)/g;

/**
 * Redacts known sensitive keys and URI credentials from any value.
 * Preserves useful identifiers like userId, sessionId (non-secret UUID), IP address, timestamps, etc.
 */
export function redactSensitiveData<T = unknown>(data: T, depth = 0): T {
  // Prevent circular references or stack overflow from overly deep nesting
  if (depth > 8 || data === null || data === undefined) {
    return data;
  }

  // Handle strings (e.g. database URLs or auth headers)
  if (typeof data === 'string') {
    return data.replace(
      URI_CREDENTIALS_REGEX,
      '$1[REDACTED]$3',
    ) as unknown as T;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item: unknown) =>
      redactSensitiveData(item, depth + 1),
    ) as unknown as T;
  }

  // Handle plain objects
  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) =>
        pattern.test(key),
      );

      // Exception: tokenFingerprint is an explicitly truncated, non-secret diagnostic prefix (e.g. 8 chars)
      if (key === 'tokenFingerprint') {
        sanitized[key] = value;
      } else if (isSensitiveKey || key.toLowerCase() === 'token') {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = redactSensitiveData(value, depth + 1);
      } else if (typeof value === 'string') {
        sanitized[key] = redactSensitiveData(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as unknown as T;
  }

  return data;
}
