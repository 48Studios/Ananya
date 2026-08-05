import {
  MaintenanceSchedule,
  MaintenanceStatus,
  ServiceFrequency,
} from "./maintenance-schedule";

export interface FindManyMaintenanceSchedulesOptions {
  customerId?: string;
  assignedTechnician?: string;
  status?: MaintenanceStatus;
  frequency?: ServiceFrequency;
  search?: string;
}

export interface MaintenanceScheduleRepository {
  findById(id: string): Promise<MaintenanceSchedule | null>;
  findByNumber(scheduleNumber: string): Promise<MaintenanceSchedule | null>;
  findMany(
    options?: FindManyMaintenanceSchedulesOptions,
  ): Promise<MaintenanceSchedule[]>;
  save(schedule: MaintenanceSchedule): Promise<void>;
  generateNextScheduleNumber(): Promise<string>;
}
