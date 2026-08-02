import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  organizationProfile,
  systemSettings,
  numberingSeries,
  featureFlags,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import {
  UpdateOrganizationProfileDto,
  UpdateSystemSettingsDto,
  UpdateNumberingSeriesDto,
  ToggleFeatureFlagDto,
} from './dtos';

@Injectable()
export class SettingsService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async getOrganizationProfile() {
    const [profile] = await db.select().from(organizationProfile);
    if (!profile) {
      const [newProfile] = await db
        .insert(organizationProfile)
        .values({
          companyName: '48 Studios',
          legalName: '48 Studios Pvt Ltd',
          taxId: 'GSTIN-33AAACD4848A1Z5',
          email: 'ops@48studios.com',
          phone: '+91 44 2848 4848',
          address: '48 Enterprise Way, Tech Park',
          city: 'Chennai',
          state: 'Tamil Nadu',
          country: 'India',
          postalCode: '600001',
          primaryTimezone: 'Asia/Kolkata',
        })
        .returning();
      return newProfile;
    }
    return profile;
  }

  async updateOrganizationProfile(
    dto: UpdateOrganizationProfileDto,
    userId?: string,
  ) {
    const profile = await this.getOrganizationProfile();

    const [updated] = await db
      .update(organizationProfile)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(organizationProfile.id, profile!.id))
      .returning();

    await this.activityService.createEvent({
      module: 'Administration',
      entityType: 'OrganizationProfile',
      entityId: profile!.id,
      eventType: 'SETTINGS_CHANGED',
      description: 'Updated Organization Legal Profile',
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: { companyName: updated!.companyName },
      userId,
    });

    await this.auditService.record({
      action: 'ORGANIZATION_PROFILE_UPDATE',
      category: 'Administration',
      userId,
      details: { companyName: updated!.companyName, taxId: updated!.taxId },
    });

    return updated;
  }

  async getSystemSettings() {
    const [settings] = await db.select().from(systemSettings);
    if (!settings) {
      const [newSettings] = await db
        .insert(systemSettings)
        .values({
          baseCurrency: 'INR',
          supportedCurrencies: ['INR', 'USD', 'EUR'],
          fiscalYearStartMonth: 4,
          dateFormat: 'YYYY-MM-DD',
        })
        .returning();
      return newSettings;
    }
    return settings;
  }

  async updateSystemSettings(dto: UpdateSystemSettingsDto, userId?: string) {
    const settings = await this.getSystemSettings();

    const [updated] = await db
      .update(systemSettings)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, settings!.id))
      .returning();

    await this.auditService.record({
      action: 'SYSTEM_SETTINGS_UPDATE',
      category: 'Administration',
      userId,
      details: {
        baseCurrency: updated!.baseCurrency,
        dateFormat: updated!.dateFormat,
      },
    });

    return updated;
  }

  async getNumberingSeries() {
    const series = await db.select().from(numberingSeries);
    if (series.length === 0) {
      await db.insert(numberingSeries).values([
        {
          entityType: 'PurchaseOrder',
          prefix: 'PO-',
          dateFormat: 'YYYY',
          nextSequenceNumber: 1,
          zeroPadLength: 6,
        },
        {
          entityType: 'WorkOrder',
          prefix: 'WO-',
          dateFormat: 'YYYY',
          nextSequenceNumber: 1,
          zeroPadLength: 6,
        },
        {
          entityType: 'Component',
          prefix: 'CMP-',
          dateFormat: '',
          nextSequenceNumber: 1,
          zeroPadLength: 6,
        },
      ]);
      return db.select().from(numberingSeries);
    }
    return series;
  }

  async updateNumberingSeries(dto: UpdateNumberingSeriesDto, userId?: string) {
    const [existing] = await db
      .select()
      .from(numberingSeries)
      .where(eq(numberingSeries.entityType, dto.entityType));

    if (!existing) {
      const [newSeries] = await db
        .insert(numberingSeries)
        .values({
          entityType: dto.entityType,
          prefix: dto.prefix,
          dateFormat: dto.dateFormat || '',
          nextSequenceNumber: dto.nextSequenceNumber || 1,
          zeroPadLength: dto.zeroPadLength || 6,
        })
        .returning();
      return newSeries;
    }

    const [updated] = await db
      .update(numberingSeries)
      .set({
        prefix: dto.prefix,
        dateFormat:
          dto.dateFormat !== undefined ? dto.dateFormat : existing.dateFormat,
        nextSequenceNumber:
          dto.nextSequenceNumber !== undefined
            ? dto.nextSequenceNumber
            : existing.nextSequenceNumber,
        zeroPadLength:
          dto.zeroPadLength !== undefined
            ? dto.zeroPadLength
            : existing.zeroPadLength,
        updatedAt: new Date(),
      })
      .where(eq(numberingSeries.id, existing.id))
      .returning();

    await this.auditService.record({
      action: 'NUMBERING_SERIES_UPDATE',
      category: 'Administration',
      userId,
      details: { entityType: dto.entityType, prefix: dto.prefix },
    });

    return updated;
  }

  async generateDocumentCode(entityType: string) {
    const [series] = await db
      .select()
      .from(numberingSeries)
      .where(eq(numberingSeries.entityType, entityType));

    if (!series) {
      return `${entityType.toUpperCase()}-${Date.now()}`;
    }

    const year = new Date().getFullYear();
    const seqStr = String(series.nextSequenceNumber).padStart(
      series.zeroPadLength,
      '0',
    );
    const code =
      series.dateFormat === 'YYYY'
        ? `${series.prefix}${year}-${seqStr}`
        : `${series.prefix}${seqStr}`;

    // Increment sequence number
    await db
      .update(numberingSeries)
      .set({
        nextSequenceNumber: series.nextSequenceNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(numberingSeries.id, series.id));

    return code;
  }

  async getFeatureFlags() {
    const flags = await db.select().from(featureFlags);
    if (flags.length === 0) {
      await db.insert(featureFlags).values([
        {
          key: 'MFA_REQUIRED',
          name: 'Multi-Factor Authentication',
          description: 'Enforce MFA for all administrative roles',
          category: 'SECURITY',
          isEnabled: false,
        },
        {
          key: 'EXPERIMENTAL_AI_FORECAST',
          name: 'AI Demand Forecasting',
          description:
            'Enable experimental machine learning demand prediction model',
          category: 'EXPERIMENTAL',
          isEnabled: false,
        },
        {
          key: 'BARCODE_STUDIO',
          name: 'Barcode & QR Code Studio',
          description:
            'Enable advanced barcode label designer & scanning interface',
          category: 'INVENTORY',
          isEnabled: true,
        },
      ]);
      return db.select().from(featureFlags);
    }
    return flags;
  }

  async toggleFeatureFlag(dto: ToggleFeatureFlagDto, userId?: string) {
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, dto.key));
    if (!flag) {
      throw new NotFoundException(`Feature Flag '${dto.key}' not found`);
    }

    const [updated] = await db
      .update(featureFlags)
      .set({ isEnabled: dto.isEnabled, updatedAt: new Date() })
      .where(eq(featureFlags.id, flag.id))
      .returning();

    await this.auditService.record({
      action: 'FEATURE_FLAG_TOGGLED',
      category: 'Administration',
      userId,
      details: { key: dto.key, isEnabled: dto.isEnabled },
    });

    return updated;
  }
}
