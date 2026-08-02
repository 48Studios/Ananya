import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class PreferencesService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async getDashboardLayout(userId: string) {
    const [layout] = await db
      .select()
      .from(userDashboardLayouts)
      .where(eq(userDashboardLayouts.userId, userId));

    if (!layout) {
      const [newLayout] = await db
        .insert(userDashboardLayouts)
        .values({
          userId,
          widgetsJson: [
            {
              id: 'stats-summary',
              title: 'Key Metrics',
              enabled: true,
              width: 'full',
            },
            {
              id: 'low-stock',
              title: 'Low Stock Inventory',
              enabled: true,
              width: 'half',
            },
            {
              id: 'recent-pos',
              title: 'Recent Purchase Orders',
              enabled: true,
              width: 'half',
            },
            {
              id: 'activity-feed',
              title: 'Operational Activity Feed',
              enabled: true,
              width: 'half',
            },
            {
              id: 'favorite-records',
              title: 'Pinned & Favorites',
              enabled: true,
              width: 'half',
            },
          ],
        })
        .returning();
      return newLayout;
    }
    return layout;
  }

  async updateDashboardLayout(userId: string, dto: UpdateDashboardLayoutDto) {
    const layout = await this.getDashboardLayout(userId);

    const [updated] = await db
      .update(userDashboardLayouts)
      .set({
        widgetsJson: dto.widgetsJson,
        updatedAt: new Date(),
      })
      .where(eq(userDashboardLayouts.id, layout!.id))
      .returning();

    await this.activityService.createEvent({
      module: 'Administration',
      entityType: 'UserDashboardLayout',
      entityId: layout!.id,
      eventType: 'SETTINGS_CHANGED',
      description: 'Updated Personal Dashboard Layout',
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: { widgetCount: dto.widgetsJson.length },
      userId,
    });

    return updated;
  }

  async getSavedViews(userId: string, module?: string) {
    return db
      .select()
      .from(userSavedViews)
      .where(
        module
          ? and(
              eq(userSavedViews.userId, userId),
              eq(userSavedViews.module, module),
            )
          : eq(userSavedViews.userId, userId),
      )
      .orderBy(desc(userSavedViews.createdAt));
  }

  async createSavedView(userId: string, dto: CreateSavedViewDto) {
    const [view] = await db
      .insert(userSavedViews)
      .values({
        userId,
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
      userId,
    });

    return view;
  }

  async getFavorites(userId: string) {
    return db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));
  }

  async addFavorite(userId: string, dto: CreateFavoriteDto) {
    const [fav] = await db
      .insert(userFavorites)
      .values({
        userId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        title: dto.title,
        href: dto.href,
      })
      .returning();

    return fav;
  }

  async removeFavorite(userId: string, id: string) {
    const [existing] = await db
      .select()
      .from(userFavorites)
      .where(and(eq(userFavorites.id, id), eq(userFavorites.userId, userId)));

    if (!existing) {
      throw new NotFoundException(`Favorite #${id} not found`);
    }

    await db.delete(userFavorites).where(eq(userFavorites.id, id));
    return { success: true };
  }

  async getWorkspacePreferences(userId: string) {
    const [pref] = await db
      .select()
      .from(userWorkspacePreferences)
      .where(eq(userWorkspacePreferences.userId, userId));

    if (!pref) {
      const [newPref] = await db
        .insert(userWorkspacePreferences)
        .values({
          userId,
          defaultLandingPage: '/dashboard',
          tableDensity: 'compact',
          themePreference: 'system',
        })
        .returning();
      return newPref;
    }
    return pref;
  }

  async updateWorkspacePreferences(
    userId: string,
    dto: UpdateWorkspacePreferenceDto,
  ) {
    const pref = await this.getWorkspacePreferences(userId);

    const [updated] = await db
      .update(userWorkspacePreferences)
      .set({
        defaultLandingPage: dto.defaultLandingPage || pref!.defaultLandingPage,
        tableDensity: dto.tableDensity || pref!.tableDensity,
        themePreference: dto.themePreference || pref!.themePreference,
        updatedAt: new Date(),
      })
      .where(eq(userWorkspacePreferences.id, pref!.id))
      .returning();

    return updated;
  }
}
