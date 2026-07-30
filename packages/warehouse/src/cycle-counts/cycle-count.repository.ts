import type { CycleCount, CycleCountStatus } from "./cycle-count";

export interface FindManyCycleCountsOptions {
  locationId?: string;
  status?: CycleCountStatus;
  assignedCounter?: string;
  search?: string;
}

export interface CycleCountRepository {
  findById(id: string): Promise<CycleCount | null>;
  findByCountNumber(countNumber: string): Promise<CycleCount | null>;
  findMany(options?: FindManyCycleCountsOptions): Promise<CycleCount[]>;
  save(count: CycleCount): Promise<void>;
  delete(id: string): Promise<void>;
  generateNextCountNumber(): Promise<string>;
}
