import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { securityAuditLogs } from '@ananya/database/schema';
import { desc, eq } from '@ananya/database/query';

export interface RecordAuditPayload {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  category: string;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}

@Injectable()
export class SecurityAuditService {
  async record(payload: RecordAuditPayload) {
    const [entry] = await db
      .insert(securityAuditLogs)
      .values({
        userId: payload.userId || null,
        userEmail: payload.userEmail || null,
        action: payload.action,
        category: payload.category,
        ipAddress: payload.ipAddress || null,
        details: payload.details || null,
      })
      .returning();
    return entry;
  }

  async getLogs(category?: string, userId?: string) {
    let query = db
      .select()
      .from(securityAuditLogs)
      .orderBy(desc(securityAuditLogs.createdAt))
      .limit(100);

    if (category) {
      query = query.where(
        eq(securityAuditLogs.category, category),
      ) as typeof query;
    }
    if (userId) {
      query = query.where(eq(securityAuditLogs.userId, userId)) as typeof query;
    }

    return query;
  }
}
