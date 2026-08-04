import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  notifications,
  notificationPreferences,
  users,
} from '@ananya/database/schema';
import { eq, and, desc, count } from '@ananya/database/query';
import { ActivityService } from '../activity/activity.service';
import {
  CreateNotificationDto,
  UpdateNotificationPreferencesDto,
} from './dtos';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

@Injectable()
export class NotificationsService {
  constructor(private readonly activityService: ActivityService) {}

  private async resolveUserId(userId?: string): Promise<string | null> {
    if (userId && UUID_REGEX.test(userId)) {
      return userId;
    }
    try {
      const [firstUser] = await db.select().from(users).limit(1);
      return firstUser ? firstUser.id : null;
    } catch {
      return null;
    }
  }

  async createNotification(dto: CreateNotificationDto) {
    const validUserId = await this.resolveUserId(dto.userId);

    const [notif] = await db
      .insert(notifications)
      .values({
        userId: validUserId,
        module: dto.module,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        entityType: dto.entityType || null,
        entityId: dto.entityId || null,
        priority: dto.priority || 'NORMAL',
        isRead: false,
        isArchived: false,
      })
      .returning();

    if (!notif) {
      throw new Error('Failed to create notification');
    }

    // Publish Activity event
    await this.activityService.createEvent({
      module: dto.module,
      entityType: dto.entityType || 'Notification',
      entityId: dto.entityId || notif.id,
      eventType: 'NOTIFICATION_PUBLISHED',
      description: dto.title,
      severity:
        dto.priority === 'URGENT' || dto.priority === 'HIGH' ? 'WARN' : 'INFO',
      status: 'COMPLETED',
      metadata: { notificationId: notif.id, type: dto.type },
      userId: validUserId || undefined,
    });

    return notif;
  }

  async getUserNotifications(userId?: string, limit = 50) {
    const validUserId = await this.resolveUserId(userId);

    return db
      .select()
      .from(notifications)
      .where(validUserId ? eq(notifications.userId, validUserId) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadCount(userId?: string) {
    const validUserId = await this.resolveUserId(userId);

    const [res] = await db
      .select({ unread: count() })
      .from(notifications)
      .where(
        validUserId
          ? and(
              eq(notifications.userId, validUserId),
              eq(notifications.isRead, false),
            )
          : eq(notifications.isRead, false),
      );
    return res ? Number(res.unread) : 0;
  }

  async markAsRead(id: string) {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Notification #${id} not found`);
    }
    return updated;
  }

  async markAllAsRead(userId?: string) {
    const validUserId = await this.resolveUserId(userId);

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        validUserId
          ? and(
              eq(notifications.userId, validUserId),
              eq(notifications.isRead, false),
            )
          : eq(notifications.isRead, false),
      );

    return { success: true };
  }

  async getPreferences(userId?: string) {
    const validUserId = await this.resolveUserId(userId);
    if (!validUserId) {
      return {
        id: 'default',
        userId: '00000000-0000-0000-0000-000000000000',
        priorityThreshold: 'LOW',
        emailEnabled: true,
        desktopEnabled: true,
        quietHoursEnabled: false,
      };
    }

    const [pref] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, validUserId));

    if (!pref) {
      const [newPref] = await db
        .insert(notificationPreferences)
        .values({
          userId: validUserId,
          priorityThreshold: 'LOW',
          emailEnabled: true,
          desktopEnabled: true,
          quietHoursEnabled: false,
        })
        .returning();
      return newPref;
    }

    return pref;
  }

  async updatePreferences(
    userId: string | undefined,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const validUserId = await this.resolveUserId(userId);
    if (!validUserId) {
      return {
        id: 'default',
        userId: '00000000-0000-0000-0000-000000000000',
        priorityThreshold: dto.priorityThreshold || 'LOW',
        emailEnabled: dto.emailEnabled ?? true,
        desktopEnabled: dto.desktopEnabled ?? true,
        quietHoursEnabled: dto.quietHoursEnabled ?? false,
      };
    }

    let pref = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, validUserId))
      .then((rows) => rows[0]);

    if (!pref) {
      const [newPref] = await db
        .insert(notificationPreferences)
        .values({
          userId: validUserId,
          priorityThreshold: 'LOW',
          emailEnabled: true,
          desktopEnabled: true,
          quietHoursEnabled: false,
        })
        .returning();
      pref = newPref!;
    }

    const [updated] = await db
      .update(notificationPreferences)
      .set({
        categoriesJson:
          dto.categoriesJson !== undefined
            ? dto.categoriesJson
            : pref.categoriesJson,
        priorityThreshold: dto.priorityThreshold || pref.priorityThreshold,
        emailEnabled:
          dto.emailEnabled !== undefined ? dto.emailEnabled : pref.emailEnabled,
        desktopEnabled:
          dto.desktopEnabled !== undefined
            ? dto.desktopEnabled
            : pref.desktopEnabled,
        quietHoursEnabled:
          dto.quietHoursEnabled !== undefined
            ? dto.quietHoursEnabled
            : pref.quietHoursEnabled,
        quietHoursStart:
          dto.quietHoursStart !== undefined
            ? dto.quietHoursStart
            : pref.quietHoursStart,
        quietHoursEnd:
          dto.quietHoursEnd !== undefined
            ? dto.quietHoursEnd
            : pref.quietHoursEnd,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.id, pref.id))
      .returning();

    return updated;
  }
}
