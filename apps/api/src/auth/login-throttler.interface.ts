export interface ILoginThrottler {
  /**
   * Returns true if the given identifier (email) and optional IP address are currently blocked
   * due to exceeding allowed failed attempts.
   */
  isBlocked(identifier: string, ipAddress?: string): boolean;

  /**
   * Record a failed login attempt.
   */
  recordFailure(identifier: string, ipAddress?: string): void;

  /**
   * Record a successful login, clearing counters.
   */
  recordSuccess(identifier: string, ipAddress?: string): void;
}
