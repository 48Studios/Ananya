import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import * as crypto from 'crypto';
import { db } from '@ananya/database';
import {
  organizationSetupStatus,
  organizationProfile,
  systemSettings,
  users,
  roles,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { ActivityService } from '../activity/activity.service';
import { AuthService } from './auth.service';
import { SetupOrganizationDto } from './dtos';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly auditService: SecurityAuditService,
    private readonly activityService: ActivityService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  async getSetupStatus() {
    try {
      const [status] = await db.select().from(organizationSetupStatus);
      const isCompleted = !!status?.isCompleted;
      return {
        isCompleted,
        bootstrapped: isCompleted,
        allowBootstrap: !isCompleted,
        completedAt: status?.completedAt,
      };
    } catch {
      return {
        isCompleted: false,
        bootstrapped: false,
        allowBootstrap: true,
      };
    }
  }

  async setupOrganization(dto: SetupOrganizationDto) {
    const status = await this.getSetupStatus();
    if (status.isCompleted) {
      throw new BadRequestException(
        'Organization setup has already been completed.',
      );
    }

    // Hash admin password
    const passwordHash = hashPassword(dto.adminPassword);

    try {
      // Fetch system Admin Role
      const [adminRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'Admin'))
        .limit(1);

      // Create Root Admin User
      const [adminUser] = await db
        .insert(users)
        .values({
          email: dto.adminEmail,
          passwordHash,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          roleId: adminRole ? adminRole.id : null,
          status: 'ACTIVE',
        })
        .returning();

      // Create / Update Organization Profile
      const [existingProfile] = await db.select().from(organizationProfile);
      if (existingProfile) {
        await db
          .update(organizationProfile)
          .set({
            companyName: dto.companyName,
            legalName: dto.legalName || undefined,
            taxId: dto.taxId || undefined,
            email: dto.adminEmail,
            phone: dto.supportPhone || undefined,
            address: dto.address || undefined,
            website: dto.website || undefined,
            country: dto.country || undefined,
            primaryTimezone: dto.primaryTimezone || undefined,
            updatedAt: new Date(),
          })
          .where(eq(organizationProfile.id, existingProfile.id));
      } else {
        await db.insert(organizationProfile).values({
          companyName: dto.companyName,
          legalName: dto.legalName || undefined,
          taxId: dto.taxId || undefined,
          email: dto.adminEmail,
          phone: dto.supportPhone || undefined,
          address: dto.address || undefined,
          website: dto.website || undefined,
          country: dto.country || undefined,
          primaryTimezone: dto.primaryTimezone || undefined,
        });
      }

      // Create / Update System Settings
      const [existingSystem] = await db.select().from(systemSettings);
      if (existingSystem) {
        await db
          .update(systemSettings)
          .set({
            baseCurrency: dto.baseCurrency || 'INR',
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existingSystem.id));
      } else {
        await db.insert(systemSettings).values({
          baseCurrency: dto.baseCurrency || 'INR',
        });
      }

      // Mark Setup Completed
      const [setupStatus] = await db
        .insert(organizationSetupStatus)
        .values({
          isCompleted: true,
          completedAt: new Date(),
          completedById: adminUser!.id,
        })
        .returning();

      await this.activityService.createEvent({
        module: 'Administration',
        entityType: 'Organization',
        entityId: setupStatus!.id,
        eventType: 'ORGANIZATION_INITIALIZED',
        description: `Organization '${dto.companyName}' initial setup completed by ${adminUser!.email}`,
        severity: 'INFO',
        status: 'COMPLETED',
        userId: adminUser!.id,
      });

      await this.auditService.record({
        action: 'ORGANIZATION_SETUP_COMPLETED',
        category: 'Security',
        userId: adminUser!.id,
        userEmail: adminUser!.email,
        details: { companyName: dto.companyName, adminEmail: adminUser!.email },
      });

      const sessionPayload = await this.authService.createSessionForUser(adminUser!.id);

      return {
        success: true,
        ...sessionPayload,
      };
    } catch (err: unknown) {
      const errorObj = err as { cause?: { code?: string }; code?: string };
      if (errorObj?.cause?.code === '42P01' || errorObj?.code === '42P01') {
        throw new BadRequestException(
          'Database tables have not been migrated yet. Please run database migrations.',
        );
      }
      throw err;
    }
  }
}
