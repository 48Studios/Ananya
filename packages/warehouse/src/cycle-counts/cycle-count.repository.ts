import type { CycleCount, CycleCountStatus } from "./cycle-count";

export interface FindManyCycleCountsOptions {
  warehouseId?: string;
  status?: CycleCountStatus;
}

export interface CycleCountRepository {
  findById(id: string): Promise<CycleCount | null>;
  findMany(options?: FindManyCycleCountsOptions): Promise<CycleCount[]>;
  save(cycleCount: CycleCount): Promise<void>;
}
