import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { db } from '@ananya/database';
import {
  userDashboardLayouts,
  userSavedViews,
  userFavorites,
  userWorkspacePreferences,
} from '@ananya/database/schema';
import { eq, and, desc } from '@ananya/database/query';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import {
  UpdateDashboardLayoutDto,
  CreateSavedViewDto,
  CreateFavoriteDto,
  UpdateWorkspacePreferenceDto,
} from './dtos';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const DEFAULT_WIDGETS = [
  {
    id: 'stats-summary',
    title: 'Key Metrics',
    enabled: true,
    width: 'full' as const,
  },
  {
    id: 'low-stock',
    title: 'Low Stock Inventory',
    enabled: true,
    width: 'half' as const,
  },
  {
    id: 'recent-pos',
    title: 'Recent Purchase Orders',
    enabled: true,
    width: 'half' as const,
  },
  {
    id: 'activity-feed',
    title: 'Operational Activity Feed',
    enabled: true,
    width: 'half' as const,
  },
  {
    id: 'favorite-records',
    title: 'Pinned & Favorites',
    enabled: true,
    width: 'half' as const,
  },
];

@Injectable()
export class PreferencesService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  private validateUserId(userId: string): string {
    if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      throw new UnauthorizedException(
        'A valid authenticated user ID is required.',
      );
    }
    return userId;
  }

  async getDashboardLayout(userId: string) {
    const validUserId = this.validateUserId(userId);

    const [layout] = await db
      .select()
      .from(userDashboardLayouts)
      .where(eq(userDashboardLayouts.userId, validUserId));

    if (!layout) {
      const [newLayout] = await db
        .insert(userDashboardLayouts)
        .values({
          userId: validUserId,
          widgetsJson: DEFAULT_WIDGETS,
        })
        .returning();
      return newLayout!;
    }
    return layout;
  }

  async updateDashboardLayout(
    userId: string,
    dto: UpdateDashboardLayoutDto,
  ) {
    const validUserId = this.validateUserId(userId);
    const layout = await this.getDashboardLayout(validUserId);

    const [updated] = await db
      .update(userDashboardLayouts)
      .set({
        widgetsJson: dto.widgetsJson,
        updatedAt: new Date(),
      })
      .where(eq(userDashboardLayouts.id, layout.id))
      .returning();

    await this.activityService.createEvent({
      module: 'Administration',
      entityType: 'UserDashboardLayout',
      entityId: layout.id,
      eventType: 'SETTINGS_CHANGED',
      description: 'Updated Personal Dashboard Layout',
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: { widgetCount: dto.widgetsJson.length },
      userId: validUserId,
    });

    return updated!;
  }

  async getSavedViews(userId: string, module?: string) {
    const validUserId = this.validateUserId(userId);

    return db
      .select()
      .from(userSavedViews)
      .where(
        module
          ? and(
              eq(userSavedViews.userId, validUserId),
              eq(userSavedViews.module, module),
            )
          : eq(userSavedViews.userId, validUserId),
      )
      .orderBy(desc(userSavedViews.createdAt));
  }

  async createSavedView(userId: string, dto: CreateSavedViewDto) {
    const validUserId = this.validateUserId(userId);

    const [view] = await db
      .insert(userSavedViews)
      .values({
        userId: validUserId,
        module: dto.module,
        name: dto.name,
        filtersJson: dto.filtersJson || {},
        sortJson: dto.sortJson || { field: 'createdAt', direction: 'desc' },
        columnsJson: dto.columnsJson || [],
        isDefault: dto.isDefault || false,
      })
      .returning();

    await this.activityService.createEvent({
      module: dto.module,
      entityType: 'SavedView',
      entityId: view!.id,
      eventType: 'SAVED_VIEW_CREATED',
      description: `Saved Custom View '${dto.name}'`,
      severity: 'INFO',
      status: 'COMPLETED',
      userId: validUserId,
    });

    return view!;
  }

  async getFavorites(userId: string) {
    const validUserId = this.validateUserId(userId);

    return db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, validUserId))
      .orderBy(desc(userFavorites.createdAt));
  }

  async addFavorite(userId: string, dto: CreateFavoriteDto) {
    const validUserId = this.validateUserId(userId);

    const [fav] = await db
      .insert(userFavorites)
      .values({
        userId: validUserId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        title: dto.title,
        href: dto.href,
      })
      .returning();

    return fav!;
  }

  async removeFavorite(userId: string, id: string) {
    const validUserId = this.validateUserId(userId);

    const [existing] = await db
      .select()
      .from(userFavorites)
      .where(
        and(eq(userFavorites.id, id), eq(userFavorites.userId, validUserId)),
      );

    if (!existing) {
      throw new NotFoundException(`Favorite #${id} not found`);
    }

    await db.delete(userFavorites).where(eq(userFavorites.id, id));
    return { success: true };
  }

  async getWorkspacePreferences(userId: string) {
    const validUserId = this.validateUserId(userId);

    const [pref] = await db
      .select()
      .from(userWorkspacePreferences)
      .where(eq(userWorkspacePreferences.userId, validUserId));

    if (!pref) {
      const [newPref] = await db
        .insert(userWorkspacePreferences)
        .values({
          userId: validUserId,
          defaultLandingPage: '/dashboard',
          tableDensity: 'compact',
          themePreference: 'system',
        })
        .returning();
      return newPref!;
    }
    return pref;
  }

  async updateWorkspacePreferences(
    userId: string,
    dto: UpdateWorkspacePreferenceDto,
  ) {
    const validUserId = this.validateUserId(userId);
    const pref = await this.getWorkspacePreferences(validUserId);

    const [updated] = await db
      .update(userWorkspacePreferences)
      .set({
        defaultLandingPage: dto.defaultLandingPage || pref.defaultLandingPage,
        tableDensity: dto.tableDensity || pref.tableDensity,
        themePreference: dto.themePreference || pref.themePreference,
        updatedAt: new Date(),
      })
      .where(eq(userWorkspacePreferences.id, pref.id))
      .returning();

    return updated!;
  }
}
