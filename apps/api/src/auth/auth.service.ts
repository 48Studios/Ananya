import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { db } from '@ananya/database';
import {
  users,
  userSessions,
  passwordResetTokens,
} from '@ananya/database/schema';
import { eq, and, or, gt, lt } from '@ananya/database/query';
import {
  LoginDto,
  ChangePasswordDto,
  ResetPasswordRequestDto,
  ResetPasswordDto,
} from './dtos';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { PasswordHasher } from './password-hasher';
import { LoginThrottlerService } from './login-throttler.service';
import { SessionCleanupService } from './session-cleanup.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: SecurityAuditService,
    private readonly loginThrottler: LoginThrottlerService,
    private readonly sessionCleanupService: SessionCleanupService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // 1. Check rate limit / brute-force protection
    try {
      this.loginThrottler.checkThrottled(dto.email, ipAddress);
    } catch (throttledErr) {
      await this.auditService.record({
        action: 'THROTTLED_LOGIN',
        category: 'SECURITY',
        userEmail: dto.email,
        ipAddress,
        details: { reason: 'Rate limit threshold exceeded' },
      });
      throw throttledErr;
    }

    const userRecord = await this.usersService.findByEmail(dto.email);
    if (!userRecord) {
      this.loginThrottler.recordFailure(dto.email, ipAddress);
      await this.auditService.record({
        action: 'LOGIN_FAILED',
        category: 'SECURITY',
        userEmail: dto.email,
        ipAddress,
        details: { reason: 'User not found' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (userRecord.status === 'DISABLED') {
      this.loginThrottler.recordFailure(dto.email, ipAddress);
      await this.auditService.record({
        action: 'LOGIN_BLOCKED',
        category: 'SECURITY',
        userId: userRecord.id,
        userEmail: userRecord.email,
        ipAddress,
        details: { reason: 'User account disabled' },
      });
      throw new UnauthorizedException(
        'Account disabled. Contact administrator.',
      );
      // Do not leak account existence or status to prevent enumeration
      throw new UnauthorizedException('Invalid credentials.');
    }
    // 2. Verify password with support for Argon2id and legacy SHA-256 transparent upgrade
    const verifyResult = await PasswordHasher.verify(
      dto.password,
      userRecord.passwordHash,
    );

    if (!verifyResult.valid) {
      this.loginThrottler.recordFailure(dto.email, ipAddress);
      await this.auditService.record({
        action: 'LOGIN_FAILED',
        category: 'SECURITY',
        userId: userRecord.id,
        userEmail: userRecord.email,
        ipAddress,
        details: { reason: 'Invalid password' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Successful login resets throttler counters
    this.loginThrottler.recordSuccess(dto.email, ipAddress);

    // 3. Transparently migrate legacy SHA-256 hash to Argon2id without forced reset
    if (verifyResult.needsRehash) {
      const newHash = await PasswordHasher.hash(dto.password);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userRecord.id));

      await this.auditService.record({
        action: 'PASSWORD_MIGRATED',
        category: 'SECURITY',
        userId: userRecord.id,
        userEmail: userRecord.email,
        details: { algorithm: 'argon2id' },
      });
    }

    return this.createSessionForUser(
      userRecord.id,
      ipAddress,
      userAgent,
      dto.rememberMe,
    );
  }

  async createSessionForUser(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    rememberMe?: boolean,
  ) {
    const userRecord = await this.usersService.findById(userId);
    if (!userRecord) {
      throw new UnauthorizedException('User not found.');
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userRecord.id));

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiryDays = rememberMe ? 30 : 1;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const [session] = await db
      .insert(userSessions)
      .values({
        userId: userRecord.id,
        token,
        ipAddress: ipAddress || '127.0.0.1',
        userAgent: userAgent || 'Unknown Browser',
        deviceInfo: userAgent ? userAgent.slice(0, 50) : 'Web App',
        expiresAt,
      })
      .returning();

    if (!session) {
      throw new UnauthorizedException('Failed to create session.');
    }

    await this.auditService.record({
      action: 'LOGIN_SUCCESS',
      category: 'SECURITY',
      userId: userRecord.id,
      userEmail: userRecord.email,
      ipAddress,
      details: { sessionId: session.id },
    });

    return {
      token: session.token,
      user: userRecord,
      permissions: userRecord.permissions,
      permissionGroups: this.permissionsService.getPermissionGroups(),
    };
  }

  async logout(token: string) {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.token, token))
      .limit(1);

    if (session) {
      await db
        .update(userSessions)
        .set({ isRevoked: true, updatedAt: new Date() })
        .where(eq(userSessions.id, session.id));

      await this.auditService.record({
        action: 'SESSION_REVOKED',
        category: 'SECURITY',
        userId: session.userId,
        details: { sessionId: session.id },
      });
    }

    return { success: true };
  }

  async getMeByToken(token: string) {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.token, token),
          eq(userSessions.isRevoked, false),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      throw new UnauthorizedException('Session expired or invalid.');
    }

    const userProfile = await this.usersService.findById(session.userId);
    return {
      user: userProfile,
      permissions: userProfile.permissions,
      permissionGroups: this.permissionsService.getPermissionGroups(),
      currentSessionId: session.id,
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSessionToken?: string,
  ) {
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord[0]) {
      throw new NotFoundException('User not found.');
    }

    const verifyResult = await PasswordHasher.verify(
      dto.currentPassword,
      userRecord[0].passwordHash,
    );

    if (!verifyResult.valid) {
      await this.auditService.record({
        action: 'PASSWORD_CHANGE_FAILED',
        category: 'SECURITY',
        userId,
        userEmail: userRecord[0].email,
        details: { reason: 'Current password verification failed' },
      });
      throw new BadRequestException('Current password does not match.');
    }

    const newHash = await PasswordHasher.hash(dto.newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Invalidate other active sessions to prevent session hijacking
    if (currentSessionToken) {
      await this.revokeAllOtherSessions(userId, currentSessionToken);
    } else {
      await db
        .update(userSessions)
        .set({ isRevoked: true, updatedAt: new Date() })
        .where(eq(userSessions.userId, userId));
    }

    await this.auditService.record({
      action: 'PASSWORD_CHANGED',
      category: 'SECURITY',
      userId,
      userEmail: userRecord[0].email,
      details: { algorithm: 'argon2id' },
    });

    return { success: true };
  }

  async requestPasswordReset(dto: ResetPasswordRequestDto) {
    const userRecord = await this.usersService.findByEmail(dto.email);
    if (userRecord) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: userRecord.id,
        token: tokenHash,
        expiresAt,
      });

      await this.auditService.record({
        action: 'PASSWORD_RESET_REQUESTED',
        category: 'SECURITY',
        userId: userRecord.id,
        userEmail: userRecord.email,
        details: {
          tokenFingerprint: tokenHash.slice(0, 8),
        },
      });
    }

    return {
      message:
        'If the account exists, password reset instructions have been generated.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const inputHash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const [tokenRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          or(
            eq(passwordResetTokens.token, inputHash),
            eq(passwordResetTokens.token, dto.token),
          ),
          eq(passwordResetTokens.isUsed, false),
        ),
      )
      .limit(1);

    if (!tokenRecord || new Date() > new Date(tokenRecord.expiresAt)) {
      throw new BadRequestException(
        'Password reset token is invalid or expired.',
      );
    }

    const newHash = await PasswordHasher.hash(dto.newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, tokenRecord.userId));

    await db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(eq(passwordResetTokens.id, tokenRecord.id));

    // Revoke all existing sessions for this user on password reset
    await db
      .update(userSessions)
      .set({ isRevoked: true, updatedAt: new Date() })
      .where(eq(userSessions.userId, tokenRecord.userId));

    await this.auditService.record({
      action: 'PASSWORD_RESET_COMPLETED',
      category: 'SECURITY',
      userId: tokenRecord.userId,
      details: { algorithm: 'argon2id' },
    });

    return { success: true };
  }

  async cleanupExpiredSessions(): Promise<{ deletedCount: number }> {
    const result = await this.sessionCleanupService.cleanupExpiredSessions();
    return { deletedCount: result.deletedCount };
  }

  async getUserSessions(userId: string) {
    return db
      .select()
      .from(userSessions)
      .where(
        and(eq(userSessions.userId, userId), eq(userSessions.isRevoked, false)),
      );
  }

  async revokeSession(userId: string, sessionId: string) {
    await db
      .update(userSessions)
      .set({ isRevoked: true, updatedAt: new Date() })
      .where(
        and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)),
      );

    await this.auditService.record({
      action: 'SESSION_REVOKED',
      category: 'SECURITY',
      userId,
      details: { sessionId },
    });

    return { success: true };
  }

  async revokeAllOtherSessions(userId: string, currentSessionToken: string) {
    const sessions = await this.getUserSessions(userId);
    for (const s of sessions) {
      if (s.token !== currentSessionToken) {
        await db
          .update(userSessions)
          .set({ isRevoked: true, updatedAt: new Date() })
          .where(eq(userSessions.id, s.id));
      }
    }

    await this.auditService.record({
      action: 'ALL_OTHER_SESSIONS_REVOKED',
      category: 'SECURITY',
      userId,
    });

    return { success: true };
  }
}
