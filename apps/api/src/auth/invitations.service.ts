import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { db } from '@ananya/database';
import { userInvitations, users } from '@ananya/database/schema';
import { eq, and } from '@ananya/database/query';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { ActivityService } from '../activity/activity.service';
import { CreateInvitationDto, AcceptInvitationDto } from './dtos';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly auditService: SecurityAuditService,
    private readonly activityService: ActivityService,
  ) {}

  async createInvitation(dto: CreateInvitationDto, invitedById?: string) {
    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email));

    if (existingUser) {
      throw new BadRequestException(
        `User with email '${dto.email}' already exists.`,
      );
    }

    const token =
      Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(userInvitations)
      .values({
        email: dto.email,
        roleId: dto.roleId || null,
        department: dto.department || null,
        token,
        expiresAt,
        status: 'PENDING',
        invitedById: invitedById || null,
      })
      .returning();

    await this.auditService.record({
      action: 'USER_INVITATION_CREATED',
      category: 'Security',
      userId: invitedById,
      userEmail: dto.email,
      details: { invitationId: invitation!.id, email: dto.email },
    });

    return invitation;
  }

  async verifyInvitationToken(token: string) {
    const [inv] = await db
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.token, token),
          eq(userInvitations.status, 'PENDING'),
        ),
      );

    if (!inv || new Date() > inv.expiresAt) {
      throw new BadRequestException(
        'Invitation token is invalid or has expired.',
      );
    }

    return inv;
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const inv = await this.verifyInvitationToken(dto.token);

    // Hash password
    const passwordHash = hashPassword(dto.password);

    const [user] = await db
      .insert(users)
      .values({
        email: inv.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        department: inv.department || null,
        roleId: inv.roleId || null,
        status: 'ACTIVE',
      })
      .returning();

    // Mark invitation as ACCEPTED
    await db
      .update(userInvitations)
      .set({ status: 'ACCEPTED' })
      .where(eq(userInvitations.id, inv.id));

    await this.activityService.createEvent({
      module: 'Administration',
      entityType: 'User',
      entityId: user!.id,
      eventType: 'INVITATION_ACCEPTED',
      description: `User ${user!.email} accepted invitation and joined workspace`,
      severity: 'INFO',
      status: 'COMPLETED',
      userId: user!.id,
    });

    await this.auditService.record({
      action: 'USER_INVITATION_ACCEPTED',
      category: 'Security',
      userId: user!.id,
      userEmail: user!.email,
      details: { userId: user!.id, email: user!.email },
    });

    return user;
  }
}
