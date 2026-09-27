import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '@ananya/database';
import {
  notifications,
  notificationPreferences,
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

  private validateUserId(userId: string): string {
    if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      throw new UnauthorizedException(
        'A valid authenticated user ID is required.',
      );
    }
    return userId;
  }

  async createNotification(dto: CreateNotificationDto) {
    let targetUserId: string | null = null;
    if (dto.userId) {
      if (!UUID_REGEX.test(dto.userId)) {
        throw new BadRequestException('Target recipient userId is not a valid UUID.');
      }
      targetUserId = dto.userId;
    }

    const [notif] = await db
      .insert(notifications)
      .values({
        userId: targetUserId,
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
      userId: targetUserId || undefined,
    });

    return notif;
  }

  async getUserNotifications(userId: string, limit = 50) {
    const validUserId = this.validateUserId(userId);

    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, validUserId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadCount(userId: string) {
    const validUserId = this.validateUserId(userId);

    const [res] = await db
      .select({ unread: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, validUserId),
          eq(notifications.isRead, false),
        ),
      );
    return res ? Number(res.unread) : 0;
  }

  async markAsRead(id: string, userId: string) {
    const validUserId = this.validateUserId(userId);

    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, validUserId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(`Notification #${id} not found or access denied`);
    }
    return updated;
  }

  async markAllAsRead(userId: string) {
    const validUserId = this.validateUserId(userId);

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, validUserId),
          eq(notifications.isRead, false),
        ),
      );

    return { success: true };
  }

  async getPreferences(userId: string) {
    const validUserId = this.validateUserId(userId);

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
      return newPref!;
    }

    return pref;
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const validUserId = this.validateUserId(userId);

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

    return updated!;
  }
}
