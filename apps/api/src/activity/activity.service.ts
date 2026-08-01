import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { activityEvents, securityAuditLogs } from '@ananya/database/schema';
import { eq, and, desc, or, ilike } from '@ananya/database/query';
import { CreateActivityEventDto, QueryActivityEventsDto } from './dtos';

@Injectable()
export class ActivityService {
  async createEvent(dto: CreateActivityEventDto) {
    const [event] = await db
      .insert(activityEvents)
      .values({
        eventType: dto.eventType,
        module: dto.module,
        entityType: dto.entityType,
        entityId: dto.entityId,
        entityTitle: dto.entityTitle || dto.entityId,
        description: dto.description,
        userId: dto.userId,
        userName: dto.userName,
        userEmail: dto.userEmail,
        status: dto.status || 'SUCCESS',
        severity: dto.severity || 'INFO',
        href: dto.href,
        ipAddress: dto.ipAddress,
        metadata: dto.metadata || {},
      })
      .returning();

    return event;
  }

  async findAll(query: QueryActivityEventsDto) {
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const conditions = [];

    if (query.module) {
      conditions.push(eq(activityEvents.module, query.module));
    }
    if (query.eventType) {
      conditions.push(eq(activityEvents.eventType, query.eventType));
    }
    if (query.entityType) {
      conditions.push(eq(activityEvents.entityType, query.entityType));
    }
    if (query.entityId) {
      conditions.push(eq(activityEvents.entityId, query.entityId));
    }
    if (query.userId) {
      conditions.push(eq(activityEvents.userId, query.userId));
    }
    if (query.severity) {
      conditions.push(eq(activityEvents.severity, query.severity));
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(activityEvents.description, term),
          ilike(activityEvents.entityTitle, term),
          ilike(activityEvents.userName, term),
          ilike(activityEvents.userEmail, term),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(activityEvents)
      .where(whereClause)
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
  }

  async findEntityEvents(entityType: string, entityId: string) {
    return db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.entityType, entityType),
          eq(activityEvents.entityId, entityId),
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(50);
  }

  async findUserEvents(userId: string) {
    return db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(50);
  }

  async getAuditTrail(query: QueryActivityEventsDto) {
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const conditions = [];

    if (query.module) {
      conditions.push(eq(securityAuditLogs.category, query.module));
    }
    if (query.userId) {
      conditions.push(eq(securityAuditLogs.userId, query.userId));
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(securityAuditLogs.action, term),
          ilike(securityAuditLogs.userEmail, term),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(securityAuditLogs)
      .where(whereClause)
      .orderBy(desc(securityAuditLogs.createdAt))
      .limit(limit);
  }
}
