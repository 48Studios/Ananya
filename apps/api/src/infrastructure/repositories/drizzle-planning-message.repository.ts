import { db } from '@ananya/database';
import { planningMessages } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { PlanningMessageRecord } from '@ananya/database/schema';
import {
  PlanningMessage,
  type PlanningMessageRepository,
  type MessageSeverity,
  type FindManyPlanningMessagesOptions,
} from '@ananya/mrp';

function toDomain(row: PlanningMessageRecord): PlanningMessage {
  return PlanningMessage.rehydrate({
    id: row.id,
    planningRunId: row.planningRunId,
    severity: row.severity as MessageSeverity,
    message: row.message,
    createdAt: row.createdAt,
  });
}

export class DrizzlePlanningMessageRepository implements PlanningMessageRepository {
  async findById(id: string): Promise<PlanningMessage | null> {
    const [row] = await db
      .select()
      .from(planningMessages)
      .where(eq(planningMessages.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyPlanningMessagesOptions,
  ): Promise<PlanningMessage[]> {
    const query = db.select().from(planningMessages);
    if (options?.planningRunId) {
      query.where(eq(planningMessages.planningRunId, options.planningRunId));
    }
    if (options?.severity) {
      query.where(eq(planningMessages.severity, options.severity));
    }

    const rows = await query.orderBy(desc(planningMessages.createdAt));
    return rows.map(toDomain);
  }

  async save(message: PlanningMessage): Promise<void> {
    await db
      .insert(planningMessages)
      .values({
        id: message.id,
        planningRunId: message.planningRunId,
        severity: message.severity,
        message: message.message,
      })
      .onConflictDoNothing();
  }

  async saveMany(messages: PlanningMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await db
      .insert(planningMessages)
      .values(
        messages.map((m) => ({
          id: m.id,
          planningRunId: m.planningRunId,
          severity: m.severity,
          message: m.message,
        })),
      )
      .onConflictDoNothing();
  }
}
