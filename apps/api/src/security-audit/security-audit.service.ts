import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { securityAuditLogs } from '@ananya/database/schema';
import { desc, eq } from '@ananya/database/query';
import { RequestContext } from '../common/context/request-context';
import { redactSensitiveData } from '../common/utils/sensitive-data-redactor';

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
    const ctx = RequestContext.get();
    const resolvedIp = payload.ipAddress || ctx?.clientIp || null;
    const resolvedUserId = payload.userId || ctx?.userId || null;
    const resolvedUserEmail = payload.userEmail || ctx?.userEmail || null;
    const sanitizedDetails = payload.details
      ? redactSensitiveData(payload.details)
      : null;

    const [entry] = await db
      .insert(securityAuditLogs)
      .values({
        userId: resolvedUserId,
        userEmail: resolvedUserEmail,
        action: payload.action,
        category: payload.category,
        ipAddress: resolvedIp,
        details: sanitizedDetails,
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
