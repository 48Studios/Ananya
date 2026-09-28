import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { db } from '@ananya/database';
import { users, userSessions } from '@ananya/database/schema';
import { eq, or, ilike } from '@ananya/database/query';
import { CreateUserDto, UpdateUserDto, AdminResetPasswordDto } from './dtos';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { RolesService } from '../roles/roles.service';
import type { AuthenticatedRequestUser } from '../auth/permission.guard';
import { PasswordHasher } from '../auth/password-hasher';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    private readonly rolesService: RolesService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureInitialAdminUser();
    } catch {
      // Catch relation does not exist error if DB tables are not yet created/migrated
    }
  }

  async ensureInitialAdminUser() {
    await this.rolesService.ensureSystemRoles();
  }

  async findAll(search?: string, roleId?: string, status?: string) {
    let query = db.select().from(users);

    if (status) {
      query = query.where(eq(users.status, status)) as typeof query;
    }

    if (roleId) {
      query = query.where(eq(users.roleId, roleId)) as typeof query;
    }

    if (search) {
      const term = `%${search}%`;
      query = query.where(
        or(
          ilike(users.firstName, term),
          ilike(users.lastName, term),
          ilike(users.email, term),
        ),
      ) as typeof query;
    }

    const userList = await query;
    const allRoles = await this.rolesService.findAll();
    const rolesMap = new Map(allRoles.map((r) => [r.id, r]));

    return userList.map((u) => {
      const userRole = u.roleId ? rolesMap.get(u.roleId) : null;
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        department: u.department,
        status: u.status,
        roleId: u.roleId,
        roleName: userRole?.name || 'No Role',
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
    });
  }

  async findById(id: string) {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    let roleName = 'No Role';
    let permissions: string[] = [];
    if (u.roleId) {
      const userRole = await this.rolesService.findById(u.roleId);
      roleName = userRole.name;
      permissions = (userRole.permissions as string[]) || [];
    }

    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      department: u.department,
      status: u.status,
      roleId: u.roleId,
      roleName,
      permissions,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async findByEmail(email: string) {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return u || null;
  }

  async create(dto: CreateUserDto, caller?: AuthenticatedRequestUser) {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        `User with email "${dto.email}" already exists.`,
      );
    }

    if (dto.roleId && caller && caller.roleName !== 'Administrator') {
      const assignedRole = await this.rolesService.findById(dto.roleId);
      if (
        assignedRole.name === 'Administrator' ||
        (assignedRole.permissions as string[])?.includes('*')
      ) {
        throw new ForbiddenException(
          'Only Administrators can assign the Administrator role.',
        );
      }
    }

    const [newUser] = await db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash: await PasswordHasher.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        department: dto.department || null,
        roleId: dto.roleId || null,
        status: 'ACTIVE',
      })
      .returning();

    if (!newUser) {
      throw new BadRequestException('Failed to create user.');
    }

    await this.auditService.record({
      action: 'USER_CREATED',
      category: 'SECURITY',
      userId: newUser.id,
      userEmail: newUser.email,
      details: {
        email: newUser.email,
        roleId: newUser.roleId,
        createdBy: caller?.email || 'system',
      },
    });

    return this.findById(newUser.id);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    caller?: AuthenticatedRequestUser,
  ) {
    const target = await this.findById(id);

    if (caller && caller.roleName !== 'Administrator') {
      if (target.roleName === 'Administrator') {
        throw new ForbiddenException(
          'Only Administrators can modify Administrator accounts.',
        );
      }

      if (dto.roleId !== undefined && dto.roleId !== null) {
        const assignedRole = await this.rolesService.findById(dto.roleId);
        if (
          assignedRole.name === 'Administrator' ||
          (assignedRole.permissions as string[])?.includes('*')
        ) {
          throw new ForbiddenException(
            'Only Administrators can assign the Administrator role.',
          );
        }
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      throw new BadRequestException('Failed to update user.');
    }

    await this.auditService.record({
      action: 'USER_UPDATED',
      category: 'SECURITY',
      userId: id,
      userEmail: updated.email,
      details: {
        updatedBy: caller?.email || 'system',
        fields: Object.keys(dto),
      },
    });

    if (dto.roleId !== undefined && dto.roleId !== target.roleId) {
      await this.auditService.record({
        action: 'ROLE_CHANGED',
        category: 'SECURITY',
        userId: id,
        userEmail: updated.email,
        details: {
          previousRoleId: target.roleId,
          newRoleId: dto.roleId,
          changedBy: caller?.email || 'system',
        },
      });

      if (dto.roleId) {
        const newRole = await this.rolesService.findById(dto.roleId);
        if (newRole && newRole.name === 'Administrator') {
          await this.auditService.record({
            action: 'ADMINISTRATOR_ASSIGNED',
            category: 'SECURITY',
            userId: id,
            userEmail: updated.email,
            details: {
              assignedBy: caller?.email || 'system',
            },
          });
        }
      }
    }

    return this.findById(id);
  }

  async disableUser(id: string, caller?: AuthenticatedRequestUser) {
    const u = await this.findById(id);
    if (u.email === 'jrsarath@48studios.internal') {
      throw new BadRequestException(
        'Primary system administrator cannot be disabled.',
      );
    }

    if (caller && caller.roleName !== 'Administrator') {
      if (u.roleName === 'Administrator') {
        throw new ForbiddenException(
          'Only Administrators can disable Administrator accounts.',
        );
      }
    }

    await db
      .update(users)
      .set({ status: 'DISABLED', updatedAt: new Date() })
      .where(eq(users.id, id));

    // Revoke all active sessions on account disable
    await db.delete(userSessions).where(eq(userSessions.userId, id));

    await this.auditService.record({
      action: 'USER_DISABLED',
      category: 'SECURITY',
      userId: id,
      userEmail: u.email,
      details: { disabledBy: caller?.email || 'system' },
    });

    return { success: true };
  }

  async activateUser(id: string, caller?: AuthenticatedRequestUser) {
    const u = await this.findById(id);

    if (caller && caller.roleName !== 'Administrator') {
      if (u.roleName === 'Administrator') {
        throw new ForbiddenException(
          'Only Administrators can activate Administrator accounts.',
        );
      }
    }

    await db
      .update(users)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(users.id, id));

    await this.auditService.record({
      action: 'USER_ACTIVATED',
      category: 'SECURITY',
      userId: id,
      userEmail: u.email,
      details: { activatedBy: caller?.email || 'system' },
    });

    return { success: true };
  }

  async adminResetPassword(
    id: string,
    dto: AdminResetPasswordDto,
    caller?: AuthenticatedRequestUser,
  ) {
    const u = await this.findById(id);

    if (caller && caller.roleName !== 'Administrator') {
      if (u.roleName === 'Administrator') {
        throw new ForbiddenException(
          'Only Administrators can reset passwords of Administrator accounts.',
        );
      }
    }

    await db
      .update(users)
      .set({
        passwordHash: await PasswordHasher.hash(dto.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    // Invalidate all active sessions for the targeted user
    await db.delete(userSessions).where(eq(userSessions.userId, id));

    await this.auditService.record({
      action: 'PASSWORD_RESET_ADMIN',
      category: 'SECURITY',
      userId: id,
      userEmail: u.email,
      details: {
        resetBy: caller?.email || caller?.id || 'admin',
        targetUserId: id,
        targetEmail: u.email,
      },
    });

    return { success: true };
  }
}
