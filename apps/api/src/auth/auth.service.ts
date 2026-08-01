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
import { eq, and } from '@ananya/database/query';
import {
  LoginDto,
  ChangePasswordDto,
  ResetPasswordRequestDto,
  ResetPasswordDto,
} from './dtos';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const userRecord = await this.usersService.findByEmail(dto.email);
    if (!userRecord) {
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
    }

    const hashedInput = hashPassword(dto.password);
    if (userRecord.passwordHash !== hashedInput) {
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

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userRecord.id));

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiryDays = dto.rememberMe ? 30 : 1;
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

    const userProfile = await this.usersService.findById(userRecord.id);

    return {
      token: session.token,
      user: userProfile,
      permissions: userProfile.permissions,
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
        action: 'LOGOUT',
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
        and(eq(userSessions.token, token), eq(userSessions.isRevoked, false)),
      )
      .limit(1);

    if (!session || new Date() > new Date(session.expiresAt)) {
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

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord[0]) {
      throw new NotFoundException('User not found.');
    }

    if (userRecord[0].passwordHash !== hashPassword(dto.currentPassword)) {
      throw new BadRequestException('Current password does not match.');
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(dto.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await this.auditService.record({
      action: 'PASSWORD_CHANGED',
      category: 'SECURITY',
      userId,
      userEmail: userRecord[0].email,
    });

    return { success: true };
  }

  async requestPasswordReset(dto: ResetPasswordRequestDto) {
    const userRecord = await this.usersService.findByEmail(dto.email);
    if (userRecord) {
      const resetToken = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: userRecord.id,
        token: resetToken,
        expiresAt,
      });

      await this.auditService.record({
        action: 'PASSWORD_RESET_REQUESTED',
        category: 'SECURITY',
        userId: userRecord.id,
        userEmail: userRecord.email,
        details: { resetToken },
      });
    }

    return {
      message:
        'If the account exists, password reset instructions have been generated.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const [tokenRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, dto.token),
          eq(passwordResetTokens.isUsed, false),
        ),
      )
      .limit(1);

    if (!tokenRecord || new Date() > new Date(tokenRecord.expiresAt)) {
      throw new BadRequestException(
        'Password reset token is invalid or expired.',
      );
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(dto.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, tokenRecord.userId));

    await db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(eq(passwordResetTokens.id, tokenRecord.id));

    await this.auditService.record({
      action: 'PASSWORD_RESET_COMPLETED',
      category: 'SECURITY',
      userId: tokenRecord.userId,
    });

    return { success: true };
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
