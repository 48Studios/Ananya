import { ObjectId } from "@ananya/core";

export type CountFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
export type CycleCountStatus = "ACTIVE" | "PAUSED";

export interface CycleCountProps {
  id: string;
  warehouseId: string;
  name: string;
  frequency: CountFrequency;
  status: CycleCountStatus;
  selectionRule?: Record<string, unknown> | null;
  nextScheduledDate: Date;
  lastExecutedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCycleCountInput {
  warehouseId: string;
  name: string;
  frequency: CountFrequency;
  selectionRule?: Record<string, unknown> | null;
  nextScheduledDate?: Date;
}

export class CycleCount {
  public readonly id: string;
  public readonly warehouseId: string;
  public name: string;
  public frequency: CountFrequency;
  public status: CycleCountStatus;
  public selectionRule?: Record<string, unknown> | null;
  public nextScheduledDate: Date;
  public lastExecutedAt?: Date | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: CycleCountProps) {
    this.id = props.id;
    this.warehouseId = props.warehouseId;
    this.name = props.name;
    this.frequency = props.frequency;
    this.status = props.status;
    this.selectionRule = props.selectionRule;
    this.nextScheduledDate = props.nextScheduledDate;
    this.lastExecutedAt = props.lastExecutedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateCycleCountInput): CycleCount {
    const id = ObjectId.generate().value;
    const now = new Date();
    const nextDate = input.nextScheduledDate ?? new Date(now.getTime() + 86400000 * 7);

    return new CycleCount({
      id,
      warehouseId: input.warehouseId,
      name: input.name.trim(),
      frequency: input.frequency,
      status: "ACTIVE",
      selectionRule: input.selectionRule ?? null,
      nextScheduledDate: nextDate,
      lastExecutedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public pause(): void {
    this.status = "PAUSED";
    this.updatedAt = new Date();
  }

  public resume(): void {
    this.status = "ACTIVE";
    this.updatedAt = new Date();
  }

  public markExecuted(): void {
    const now = new Date();
    this.lastExecutedAt = now;

    const days =
      this.frequency === "DAILY"
        ? 1
        : this.frequency === "WEEKLY"
        ? 7
        : this.frequency === "MONTHLY"
        ? 30
        : 90;

    this.nextScheduledDate = new Date(now.getTime() + days * 86400000);
    this.updatedAt = now;
  }

  public static rehydrate(props: CycleCountProps): CycleCount {
    return new CycleCount(props);
  }
}
