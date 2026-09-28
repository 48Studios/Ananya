import { HttpStatus, HttpException } from '@nestjs/common';
import { LoginThrottlerService } from './login-throttler.service';

describe('LoginThrottlerService', () => {
  let service: LoginThrottlerService;

  beforeEach(() => {
    service = new LoginThrottlerService({
      maxAttempts: 5,
      windowMs: 1000, // 1 second window for fast deterministic tests
    });
    process.env.ENABLE_TEST_RATE_LIMIT = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_TEST_RATE_LIMIT;
    service.reset();
  });

  it('permits attempts below the failure threshold', () => {
    expect(() => {
      service.checkRateLimit('user@example.com', '192.168.1.100');
    }).not.toThrow();
  });

  it('blocks attempts after max failure threshold is reached with 429 Too Many Requests', () => {
    const email = 'target@example.com';
    const ip = '192.168.1.50';

    for (let i = 0; i < 5; i++) {
      service.recordFailure(email, ip);
    }

    try {
      service.checkRateLimit(email, ip);
      fail('Expected rate limit HttpException to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpErr = error as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const response = httpErr.getResponse() as {
        message: string;
        retryAfter: number;
      };
      expect(response.message).toMatch(/Too many failed login attempts/i);
      expect(response.retryAfter).toBeGreaterThan(0);
    }
  });

  it('normalizes email case-insensitively and with whitespace trimmed', () => {
    const email = '  Target@Example.COM  ';
    const ip = '10.0.0.1';

    for (let i = 0; i < 5; i++) {
      service.recordFailure(email, ip);
    }

    expect(() => {
      service.checkRateLimit('target@example.com', ip);
    }).toThrow(HttpException);
  });

  it('clears failed records upon successful authentication', () => {
    const email = 'user@example.com';
    const ip = '192.168.1.50';

    for (let i = 0; i < 4; i++) {
      service.recordFailure(email, ip);
    }

    service.recordSuccess(email, ip);

    // After success, a single failure does not trigger rate limiting
    service.recordFailure(email, ip);
    expect(() => {
      service.checkRateLimit(email, ip);
    }).not.toThrow();
  });

  it('prunes stale records after windowMs expires to prevent memory exhaustion', async () => {
    const email = 'stale@example.com';
    const ip = '192.168.1.99';

    service.recordFailure(email, ip);
    expect(service.getTrackedKeyCount()).toBeGreaterThan(0);

    // Wait past windowMs (1000ms)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    service.pruneStaleRecords();
    expect(service.getTrackedKeyCount()).toBe(0);
  });
});
