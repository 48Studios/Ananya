import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { db } from '@ananya/database';
import { users } from '@ananya/database/schema';
import { eq, or, ilike } from '@ananya/database/query';
import { CreateUserDto, UpdateUserDto, AdminResetPasswordDto } from './dtos';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { RolesService } from '../roles/roles.service';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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

  async create(dto: CreateUserDto) {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        `User with email "${dto.email}" already exists.`,
      );
    }

    const [newUser] = await db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash: hashPassword(dto.password),
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
      details: { email: newUser.email, roleId: newUser.roleId },
    });

    return this.findById(newUser.id);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);

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
    });

    return this.findById(id);
  }

  async disableUser(id: string) {
    const u = await this.findById(id);
    if (u.email === 'jrsarath@48studios.internal') {
      throw new BadRequestException(
        'Primary system administrator cannot be disabled.',
      );
    }

    await db
      .update(users)
      .set({ status: 'DISABLED', updatedAt: new Date() })
      .where(eq(users.id, id));

    await this.auditService.record({
      action: 'USER_DISABLED',
      category: 'SECURITY',
      userId: id,
      userEmail: u.email,
    });

    return { success: true };
  }

  async activateUser(id: string) {
    const u = await this.findById(id);

    await db
      .update(users)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(users.id, id));

    await this.auditService.record({
      action: 'USER_ACTIVATED',
      category: 'SECURITY',
      userId: id,
      userEmail: u.email,
    });

    return { success: true };
  }

  async adminResetPassword(id: string, dto: AdminResetPasswordDto) {
    const u = await this.findById(id);

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(dto.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    await this.auditService.record({
      action: 'PASSWORD_RESET_ADMIN',
      category: 'SECURITY',
      userId: id,
      userEmail: u.email,
    });

    return { success: true };
  }
}
