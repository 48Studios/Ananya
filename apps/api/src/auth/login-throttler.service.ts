import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';

export interface ThrottlerConfig {
  maxAttempts: number;
  windowMs: number;
  maxTrackedKeys?: number;
}

import { ILoginThrottler } from './login-throttler.interface';

@Injectable()
export class LoginThrottlerService implements ILoginThrottler {
  private readonly logger = new Logger(LoginThrottlerService.name);

  // In-memory sliding window map: key -> array of failure timestamps
  private readonly failureRecords = new Map<string, number[]>();

  private readonly config: ThrottlerConfig = {
    maxAttempts: 5,
    windowMs: 60 * 1000, // 60 seconds
    maxTrackedKeys: 10000,
  };

  private lastPruneTime = Date.now();
  private readonly PRUNE_INTERVAL_MS = 60 * 1000; // Prune every 60s

  constructor(@Optional() customConfig?: Partial<ThrottlerConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
  }

  /**
   * Normalizes an identifier (e.g. email) safely.
   */
  private normalizeIdentifier(identifier: string): string {
    return identifier ? identifier.trim().toLowerCase() : '';
  }

  /**
   * Normalizes an IP address safely (strips port, trims, handles IPv4-mapped IPv6).
   */
  private normalizeIp(ip?: string): string | null {
    if (!ip) return null;
    let cleaned = ip.trim().toLowerCase();
    if (cleaned.startsWith('::ffff:')) {
      cleaned = cleaned.slice(7);
    }
    // Filter out localhost variations from IP-specific lockout so local dev/tests aren't locked out entirely
    if (cleaned === '127.0.0.1' || cleaned === '::1' || cleaned === 'localhost') {
      return null;
    }
    return cleaned;
  }

  /**
   * Prunes stale records from memory to prevent unbounded memory growth.
   */
  public pruneStaleRecords(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.failureRecords.entries()) {
      const activeTimestamps = timestamps.filter((t) => now - t < this.config.windowMs);
      if (activeTimestamps.length === 0) {
        this.failureRecords.delete(key);
      } else {
        this.failureRecords.set(key, activeTimestamps);
      }
    }
    this.lastPruneTime = now;
  }

  /**
   * Checks if an email or client IP has exceeded the allowed failed attempts within the sliding window.
   * Throws HTTP 429 Too Many Requests with retryAfter if throttled.
   */
  checkRateLimit(identifier: string, ipAddress?: string): void {
    if (process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== 'true') {
      return;
    }

    const now = Date.now();
    if (now - this.lastPruneTime > this.PRUNE_INTERVAL_MS) {
      this.pruneStaleRecords();
    }

    const normalizedEmail = this.normalizeIdentifier(identifier);
    const normalizedIp = this.normalizeIp(ipAddress);

    const keysToCheck: string[] = [];
    if (normalizedEmail) keysToCheck.push(normalizedEmail);
    if (normalizedIp) keysToCheck.push(`ip:${normalizedIp}`);

    for (const key of keysToCheck) {
      const timestamps = this.failureRecords.get(key) || [];
      const recentTimestamps = timestamps.filter(
        (t) => now - t < this.config.windowMs,
      );

      if (recentTimestamps.length >= this.config.maxAttempts) {
        const oldestRecent = recentTimestamps[0] ?? now;
        const retryAfterSeconds = Math.ceil(
          (this.config.windowMs - (now - oldestRecent)) / 1000,
        );

        this.logger.warn(
          `[RATE_LIMIT_TRIGGERED] Login attempt blocked for "${key}". Retry after ${retryAfterSeconds}s.`,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `Too many failed login attempts. Please try again in ${retryAfterSeconds} seconds.`,
            retryAfter: retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /**
   * Alias for checkRateLimit
   */
  checkThrottled(identifier: string, ipAddress?: string): void {
    this.checkRateLimit(identifier, ipAddress);
  }
  /**
   * Returns true if the identifier/IP is blocked (rate limit exceeded).
   */
  isBlocked(identifier: string, ipAddress?: string): boolean {
    try {
      this.checkRateLimit(identifier, ipAddress);
      return false;
    } catch (e) {
      if (e instanceof HttpException && e.getStatus && e.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        return true;
      }
      throw e;
    }
  }

  /**
   * Records a failed login attempt for an identifier and client IP.
   */
  recordFailure(identifier: string, ipAddress?: string): void {
    const now = Date.now();
    const normalizedEmail = this.normalizeIdentifier(identifier);
    const normalizedIp = this.normalizeIp(ipAddress);

    const keysToRecord: string[] = [];
    if (normalizedEmail) keysToRecord.push(normalizedEmail);
    if (normalizedIp) keysToRecord.push(`ip:${normalizedIp}`);

    for (const key of keysToRecord) {
      const timestamps = this.failureRecords.get(key) || [];
      const recent = timestamps.filter((t) => now - t < this.config.windowMs);
      recent.push(now);
      this.failureRecords.set(key, recent);
    }

    // Safety guard against memory exhaustion
    if (this.failureRecords.size > (this.config.maxTrackedKeys || 10000)) {
      this.pruneStaleRecords();
    }
  }

  /**
   * Resets failed attempt counters for an identifier and client IP upon successful login.
   */
  recordSuccess(identifier: string, ipAddress?: string): void {
    const normalizedEmail = this.normalizeIdentifier(identifier);
    const normalizedIp = this.normalizeIp(ipAddress);

    if (normalizedEmail) {
      this.failureRecords.delete(normalizedEmail);
    }
    if (normalizedIp) {
      this.failureRecords.delete(`ip:${normalizedIp}`);
    }
  }

  /**
   * Clears all in-memory tracking state (primarily for test resets).
   */
  reset(): void {
    this.failureRecords.clear();
  }

  /**
   * Returns current count of tracked keys (useful for tests verifying memory bounds).
   */
  getTrackedKeyCount(): number {
    return this.failureRecords.size;
  }
}
