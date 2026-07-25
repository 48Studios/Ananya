import { db } from '@ananya/database';
import { crmActivities } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { CrmActivityRecord } from '@ananya/database/schema';
import {
  Activity,
  type ActivityRepository,
  type ActivityType,
  type ActivityStatus,
  type FindManyActivitiesOptions,
} from '@ananya/crm';

function toDomain(row: CrmActivityRecord): Activity {
  return Activity.rehydrate({
    id: row.id,
    type: row.type as ActivityType,
    subject: row.subject,
    dueDate: row.dueDate,
    owner: row.owner,
    status: row.status as ActivityStatus,
    relatedLeadId: row.relatedLeadId ?? undefined,
    relatedOpportunityId: row.relatedOpportunityId ?? undefined,
    relatedAccountId: row.relatedAccountId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleActivityRepository implements ActivityRepository {
  async findById(id: string): Promise<Activity | null> {
    const [row] = await db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyActivitiesOptions): Promise<Activity[]> {
    const query = db.select().from(crmActivities);
    if (options?.type) {
      query.where(eq(crmActivities.type, options.type));
    }
    if (options?.status) {
      query.where(eq(crmActivities.status, options.status));
    }
    if (options?.owner) {
      query.where(eq(crmActivities.owner, options.owner));
    }
    if (options?.relatedLeadId) {
      query.where(eq(crmActivities.relatedLeadId, options.relatedLeadId));
    }
    if (options?.relatedAccountId) {
      query.where(eq(crmActivities.relatedAccountId, options.relatedAccountId));
    }
    if (options?.relatedOpportunityId) {
      query.where(
        eq(crmActivities.relatedOpportunityId, options.relatedOpportunityId),
      );
    }
    const rows = await query.orderBy(desc(crmActivities.dueDate));
    return rows.map(toDomain);
  }

  async save(activity: Activity): Promise<void> {
    await db
      .insert(crmActivities)
      .values({
        id: activity.id,
        type: activity.type,
        subject: activity.subject,
        dueDate: activity.dueDate,
        owner: activity.owner,
        status: activity.status,
        relatedLeadId: activity.relatedLeadId ?? null,
        relatedAccountId: activity.relatedAccountId ?? null,
        relatedOpportunityId: activity.relatedOpportunityId ?? null,
      })
      .onConflictDoUpdate({
        target: crmActivities.id,
        set: {
          subject: activity.subject,
          dueDate: activity.dueDate,
          owner: activity.owner,
          status: activity.status,
          updatedAt: new Date(),
        },
      });
  }
}
