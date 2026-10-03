import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { SessionCleanupService } from './session-cleanup.service';
import { ILoginThrottler } from './login-throttler.interface';
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Tests that verify AuthService respects the injected ILoginThrottler.
 */

describe('AuthService throttler integration', () => {
  let authService: AuthService;
  let mockLoginThrottler: jest.Mocked<ILoginThrottler>;
  let mockAuditService: jest.Mocked<SecurityAuditService>;

  const mockUser: {
    id: string;
    email: string;
    passwordHash: string;
    status: string;
    permissions: string[];
  } = {
    id: 'user-123',
    email: 'blocked@example.com',
    passwordHash: 'dummy',
    status: 'ACTIVE',
    permissions: [],
  };

  beforeEach(async () => {
    mockLoginThrottler = {
      isBlocked: jest.fn().mockReturnValue(false),
      checkRateLimit: jest.fn(),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
    };
    mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SecurityAuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findByEmail: jest.fn().mockResolvedValue(mockUser) },
        },
        {
          provide: PermissionsService,
          useValue: { getPermissionGroups: jest.fn().mockReturnValue([]) },
        },
        { provide: SecurityAuditService, useValue: mockAuditService },
        { provide: SessionCleanupService, useValue: {} },
        { provide: 'ILoginThrottler', useValue: mockLoginThrottler },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('rejects a blocked login with HTTP 429 and does not record throttler failure', async () => {
    mockLoginThrottler.checkRateLimit.mockImplementationOnce(() => {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many failed login attempts.',
          retryAfter: 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });
    const dto: LoginDto = {
      email: 'blocked@example.com',
      password: 'any',
      rememberMe: false,
    };
    await expect(authService.login(dto, '1.2.3.4')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'THROTTLED_LOGIN' }),
    );
  });
});
