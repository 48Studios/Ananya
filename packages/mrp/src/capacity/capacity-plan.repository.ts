import { CapacityPlan } from "./capacity-plan";

export interface FindManyCapacityPlansOptions {
  planningRunId?: string;
  workCenterId?: string;
  onlyOverloaded?: boolean;
}

export interface CapacityPlanRepository {
  findById(id: string): Promise<CapacityPlan | null>;
  findMany(options?: FindManyCapacityPlansOptions): Promise<CapacityPlan[]>;
  save(plan: CapacityPlan): Promise<void>;
  saveMany(plans: CapacityPlan[]): Promise<void>;
}
