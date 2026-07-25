import { db } from '@ananya/database';
import { capacityPlans } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { CapacityPlanRecord } from '@ananya/database/schema';
import {
  CapacityPlan,
  type CapacityPlanRepository,
  type FindManyCapacityPlansOptions,
} from '@ananya/mrp';

function toDomain(row: CapacityPlanRecord): CapacityPlan {
  return CapacityPlan.rehydrate({
    id: row.id,
    planningRunId: row.planningRunId,
    workCenterId: row.workCenterId,
    workCenterName: row.workCenterName,
    availableCapacityHours: parseFloat(row.availableCapacityHours),
    plannedCapacityHours: parseFloat(row.plannedCapacityHours),
    utilizationPercentage: parseFloat(row.utilizationPercentage),
    isOverloaded: row.isOverloaded,
    createdAt: row.createdAt,
  });
}

export class DrizzleCapacityPlanRepository implements CapacityPlanRepository {
  async findById(id: string): Promise<CapacityPlan | null> {
    const [row] = await db
      .select()
      .from(capacityPlans)
      .where(eq(capacityPlans.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyCapacityPlansOptions,
  ): Promise<CapacityPlan[]> {
    const query = db.select().from(capacityPlans);
    if (options?.planningRunId) {
      query.where(eq(capacityPlans.planningRunId, options.planningRunId));
    }
    if (options?.workCenterId) {
      query.where(eq(capacityPlans.workCenterId, options.workCenterId));
    }
    if (options?.onlyOverloaded) {
      query.where(eq(capacityPlans.isOverloaded, true));
    }

    const rows = await query.orderBy(desc(capacityPlans.createdAt));
    return rows.map(toDomain);
  }

  async save(plan: CapacityPlan): Promise<void> {
    await db
      .insert(capacityPlans)
      .values({
        id: plan.id,
        planningRunId: plan.planningRunId,
        workCenterId: plan.workCenterId,
        workCenterName: plan.workCenterName,
        availableCapacityHours: plan.availableCapacityHours.toString(),
        plannedCapacityHours: plan.plannedCapacityHours.toString(),
        utilizationPercentage: plan.utilizationPercentage.toString(),
        isOverloaded: plan.isOverloaded,
      })
      .onConflictDoNothing();
  }

  async saveMany(plans: CapacityPlan[]): Promise<void> {
    if (plans.length === 0) return;
    await db
      .insert(capacityPlans)
      .values(
        plans.map((p) => ({
          id: p.id,
          planningRunId: p.planningRunId,
          workCenterId: p.workCenterId,
          workCenterName: p.workCenterName,
          availableCapacityHours: p.availableCapacityHours.toString(),
          plannedCapacityHours: p.plannedCapacityHours.toString(),
          utilizationPercentage: p.utilizationPercentage.toString(),
          isOverloaded: p.isOverloaded,
        })),
      )
      .onConflictDoNothing();
  }
}
