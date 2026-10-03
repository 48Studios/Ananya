export interface ILoginThrottler {
  /**
   * Returns true if the given identifier (email) and optional IP address are currently blocked
   * due to exceeding allowed failed attempts.
   */
  isBlocked(identifier: string, ipAddress?: string): boolean;

  /**
   * Throws the canonical HTTP 429 (statusCode, error, message, retryAfter)
   * when the identifier/IP exceeded the allowed failed attempts. Prefer this
   * over isBlocked at API boundaries so callers receive the retry detail.
   */
  checkRateLimit(identifier: string, ipAddress?: string): void;

  /**
   * Record a failed login attempt.
   */
  recordFailure(identifier: string, ipAddress?: string): void;

  /**
   * Record a successful login, clearing counters.
   */
  recordSuccess(identifier: string, ipAddress?: string): void;
}
