import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { db, pool } from '@ananya/database';
import { users } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { ResetOrganizationDto } from './dtos';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

@Injectable()
export class OrganizationResetService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async resetOrganizationData(dto: ResetOrganizationDto, userId: string) {
    if (dto.confirmText !== 'RESET MY ORGANIZATION') {
      throw new BadRequestException(
        'Invalid confirmation text. You must type "RESET MY ORGANIZATION" exactly.',
      );
    }

    // Verify user & password authentication
    const isUuid =
      typeof userId === 'string' &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        userId,
      );

    const [user] = isUuid
      ? await db.select().from(users).where(eq(users.id, userId)).limit(1)
      : await db.select().from(users).limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const inputHash = hashPassword(dto.passwordConfirm);
    if (user.passwordHash !== inputHash) {
      throw new UnauthorizedException(
        'Password verification failed. Incorrect password.',
      );
    }

    console.log(
      `⚠️ Executing Organization Reset for tenant by ${user.email}...`,
    );

    // List of business data tables to truncate (Preserving tenant, users, roles, settings, audit logs)
    const BUSINESS_TABLES = [
      'inventory_reservation_lines',
      'inventory_reservations',
      'inventory_transactions',
      'inventory_projections',
      'goods_receipt_lines',
      'goods_receipts',
      'purchase_order_lines',
      'purchase_orders',
      'supplier_contacts',
      'supplier_returns',
      'suppliers',
      'production_order_operations',
      'production_orders',
      'bill_of_material_lines',
      'bill_of_materials',
      'project_activities',
      'time_entries',
      'project_tasks',
      'project_milestones',
      'project_materials',
      'projects',
      'customer_contacts',
      'customer_addresses',
      'customers',
      'warehouse_bins',
      'warehouse_zones',
      'warehouses',
      'warehouse_transfers',
      'stock_adjustments',
      'cycle_counts',
      'stock_counts',
      'components',
      'categories',
      'units',
      'manufacturers',
      'locations',
      'import_export_jobs',
    ];

    try {
      const truncateStatements = BUSINESS_TABLES.map(
        (name) => `"${name}"`,
      ).join(', ');
      await pool.query(
        `TRUNCATE TABLE ${truncateStatements} RESTART IDENTITY CASCADE;`,
      );

      await this.activityService.createEvent({
        module: 'Administration',
        entityType: 'Organization',
        entityId: user.id,
        eventType: 'ORGANIZATION_DATA_RESET',
        description: `Organization business data successfully reset by ${user.email}`,
        severity: 'CRITICAL',
        status: 'COMPLETED',
        userId: user.id,
      });

      await this.auditService.record({
        action: 'ORGANIZATION_DATA_RESET',
        category: 'Security',
        userId: user.id,
        userEmail: user.email,
        details: { resetBy: user.email, timestamp: new Date() },
      });

      return {
        success: true,
        message:
          'Organization business data successfully reset. Platform configuration preserved.',
        resetAt: new Date(),
      };
    } catch (err: unknown) {
      console.error('❌ Failed to execute organization reset:', err);
      throw new BadRequestException('Failed to execute organization reset.');
    }
  }
}
