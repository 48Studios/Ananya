import { PlanningRun, PlanningRunStatus } from './planning-run';

export interface FindManyPlanningRunsOptions {
  status?: PlanningRunStatus;
  startedBy?: string;
  search?: string;
}

export interface PlanningRunRepository {
  findById(id: string): Promise<PlanningRun | null>;
  findByNumber(runNumber: string): Promise<PlanningRun | null>;
  findMany(options?: FindManyPlanningRunsOptions): Promise<PlanningRun[]>;
  save(run: PlanningRun): Promise<void>;
  generateNextRunNumber(): Promise<string>;
}
