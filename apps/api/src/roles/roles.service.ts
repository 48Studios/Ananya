import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { db } from '@ananya/database';
import { roles } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { CreateRoleDto, UpdateRoleDto } from './dtos';
import { SYSTEM_ROLE_PERMISSIONS } from '../permissions/permissions.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(private readonly auditService: SecurityAuditService) { }

  async onModuleInit() {
    try {
      await this.ensureSystemRoles();
    } catch {
      // Catch relation does not exist error if DB tables are not yet created/migrated
    }
  }

  async ensureSystemRoles() {
    for (const [roleName, permissions] of Object.entries(
      SYSTEM_ROLE_PERMISSIONS,
    )) {
      const [existing] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, roleName))
        .limit(1);

      if (!existing) {
        await db.insert(roles).values({
          name: roleName,
          description: `System defined ${roleName} role`,
          isSystem: true,
          permissions,
        });
      }
    }
  }

  async findAll() {
    return db.select().from(roles);
  }

  async findById(id: string) {
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found.`);
    }
    return role;
  }

  async create(dto: CreateRoleDto) {
    const [existing] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, dto.name))
      .limit(1);

    if (existing) {
      throw new BadRequestException(
        `Role with name "${dto.name}" already exists.`,
      );
    }

    const [role] = await db
      .insert(roles)
      .values({
        name: dto.name,
        description: dto.description || null,
        isSystem: false,
        permissions: dto.permissions,
      })
      .returning();

    if (!role) {
      throw new BadRequestException('Failed to create role.');
    }

    await this.auditService.record({
      action: 'ROLE_CREATED',
      category: 'SECURITY',
      details: { roleId: role.id, name: role.name },
    });

    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findById(id);

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new BadRequestException('System role names cannot be altered.');
    }

    const [updated] = await db
      .update(roles)
      .set({
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.permissions ? { permissions: dto.permissions } : {}),
        updatedAt: new Date(),
      })
      .where(eq(roles.id, id))
      .returning();

    if (!updated) {
      throw new BadRequestException('Failed to update role.');
    }

    await this.auditService.record({
      action: 'ROLE_UPDATED',
      category: 'SECURITY',
      details: { roleId: id, name: updated.name },
    });

    return updated;
  }

  async delete(id: string) {
    const role = await this.findById(id);

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted.');
    }

    await db.delete(roles).where(eq(roles.id, id));

    await this.auditService.record({
      action: 'ROLE_DELETED',
      category: 'SECURITY',
      details: { roleId: id, name: role.name },
    });

    return { success: true };
  }
}
