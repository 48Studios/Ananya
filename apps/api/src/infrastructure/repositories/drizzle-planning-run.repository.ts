import { db } from '@ananya/database';
import { planningRuns } from '@ananya/database/schema';
import { and, eq, desc, ilike, sql } from '@ananya/database/query';
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
    const conditions = [];
    if (options?.status) {
      conditions.push(eq(planningRuns.status, options.status));
    }
    if (options?.startedBy) {
      conditions.push(eq(planningRuns.startedBy, options.startedBy));
    }
    if (options?.search) {
      conditions.push(ilike(planningRuns.runNumber, `%${options.search}%`));
    }

    const rows = await db
      .select()
      .from(planningRuns)
      .where(and(...conditions))
      .orderBy(desc(planningRuns.createdAt));
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

  /**
   * Derives the next sequence from the highest existing number for the year
   * rather than a row count. A count-based sequence collides with an existing
   * `run_number` as soon as any run row is removed, which fails the unique
   * constraint and aborts the whole planning run.
   */
  async generateNextRunNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MRP-${year}-`;
    const [result] = await db
      .select({ maxNumber: sql<string | null>`MAX(${planningRuns.runNumber})` })
      .from(planningRuns)
      .where(ilike(planningRuns.runNumber, `${prefix}%`));

    const maxSequence = result?.maxNumber
      ? Number.parseInt(result.maxNumber.slice(prefix.length), 10)
      : 0;
    const nextSequence = Number.isFinite(maxSequence) ? maxSequence + 1 : 1;
    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }
}
