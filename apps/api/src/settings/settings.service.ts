import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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
import { InventoryAlertsService } from '../inventory-alerts/inventory-alerts.service';
import {
  UpdateOrganizationProfileDto,
  UpdateSystemSettingsDto,
  UpdateNumberingSeriesDto,
  ToggleFeatureFlagDto,
} from './dtos';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
    // Optional so unit tests can construct the service without the alerting
    // subsystem; the module always provides it in the running application.
    @Optional()
    private readonly inventoryAlertsService?: InventoryAlertsService,
  ) {}

  async getOrganizationProfile() {
    const [profile] = await db.select().from(organizationProfile);
    if (!profile) {
      const [newProfile] = await db
        .insert(organizationProfile)
        .values({
          companyName: 'ACME Corporation',
          legalName: 'ACME Corporation',
          taxId: 'EXAMPLE-TAX-ID',
          email: 'operations@example.com',
          phone: '+1 202-555-0100',
          address: '123 Example Street',
          city: 'Example City',
          state: 'Example Region',
          country: 'United States',
          postalCode: '00000',
          primaryTimezone: 'Etc/UTC',
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
    const { reorderDefaultsJson, ...rest } = dto;

    const [updated] = await db
      .update(systemSettings)
      .set({
        ...rest,
        // Merge so a partial threshold edit preserves reorderQuantity.
        ...(reorderDefaultsJson !== undefined
          ? {
              reorderDefaultsJson: {
                ...(settings!.reorderDefaultsJson ?? {}),
                ...reorderDefaultsJson,
              },
            }
          : {}),
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

    // A reorder-default edit changes the alert threshold, so alert state must
    // be re-derived immediately rather than waiting for the scheduler.
    if (dto.reorderDefaultsJson !== undefined) {
      await this.evaluateInventoryAlertsAfterThresholdChange();
    }

    return updated;
  }

  private async evaluateInventoryAlertsAfterThresholdChange(): Promise<void> {
    if (!this.inventoryAlertsService) return;
    try {
      await this.inventoryAlertsService.evaluate();
    } catch (error: unknown) {
      this.logger.error(
        `Inventory alert evaluation after threshold change failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
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
