import { db } from '@ananya/database';
import { planningRuns } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { PlanningRunRecord } from '@ananya/database/schema';
import {
  PlanningRun,
  type PlanningRunRepository,
  type PlanningRunStatus,
  type FindManyPlanningRunsOptions,
} from '@ananya/mrp';

function toDomain(row: PlanningRunRecord): PlanningRun {
  return PlanningRun.rehydrate({
    id: row.id,
    runNumber: row.runNumber,
    horizonDays: row.horizonDays,
    status: row.status as PlanningRunStatus,
    startedBy: row.startedBy,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzlePlanningRunRepository implements PlanningRunRepository {
  async findById(id: string): Promise<PlanningRun | null> {
    const [row] = await db
      .select()
      .from(planningRuns)
      .where(eq(planningRuns.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(runNumber: string): Promise<PlanningRun | null> {
    const [row] = await db
      .select()
      .from(planningRuns)
      .where(eq(planningRuns.runNumber, runNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyPlanningRunsOptions,
  ): Promise<PlanningRun[]> {
    const query = db.select().from(planningRuns);
    if (options?.status) {
      query.where(eq(planningRuns.status, options.status));
    }
    if (options?.startedBy) {
      query.where(eq(planningRuns.startedBy, options.startedBy));
    }
    if (options?.search) {
      query.where(ilike(planningRuns.runNumber, `%${options.search}%`));
    }

    const rows = await query.orderBy(desc(planningRuns.createdAt));
    return rows.map(toDomain);
  }

  async save(run: PlanningRun): Promise<void> {
    await db
      .insert(planningRuns)
      .values({
        id: run.id,
        runNumber: run.runNumber,
        horizonDays: run.horizonDays,
        status: run.status,
        startedBy: run.startedBy,
        completedAt: run.completedAt ?? null,
      })
      .onConflictDoUpdate({
        target: planningRuns.id,
        set: {
          status: run.status,
          completedAt: run.completedAt ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextRunNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(planningRuns);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `MRP-${year}-${num}`;
  }
}
