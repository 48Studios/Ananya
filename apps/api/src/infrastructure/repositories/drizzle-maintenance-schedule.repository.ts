import { db } from '@ananya/database';
import { maintenanceSchedules } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { MaintenanceScheduleRecord } from '@ananya/database/schema';
import {
  MaintenanceSchedule,
  type MaintenanceScheduleRepository,
  type MaintenanceStatus,
  type ServiceFrequency,
  type FindManyMaintenanceSchedulesOptions,
} from '@ananya/service';

function toDomain(row: MaintenanceScheduleRecord): MaintenanceSchedule {
  return MaintenanceSchedule.rehydrate({
    id: row.id,
    scheduleNumber: row.scheduleNumber,
    customerId: row.customerId,
    assetName: row.assetName,
    serialNumber: row.serialNumber ?? undefined,
    frequency: row.frequency as ServiceFrequency,
    nextVisitDate: row.nextVisitDate,
    assignedTechnician: row.assignedTechnician ?? undefined,
    status: row.status as MaintenanceStatus,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleMaintenanceScheduleRepository implements MaintenanceScheduleRepository {
  async findById(id: string): Promise<MaintenanceSchedule | null> {
    const [row] = await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(
    scheduleNumber: string,
  ): Promise<MaintenanceSchedule | null> {
    const [row] = await db
      .select()
      .from(maintenanceSchedules)
      .where(
        eq(maintenanceSchedules.scheduleNumber, scheduleNumber.toUpperCase()),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyMaintenanceSchedulesOptions,
  ): Promise<MaintenanceSchedule[]> {
    const query = db.select().from(maintenanceSchedules);
    if (options?.customerId) {
      query.where(eq(maintenanceSchedules.customerId, options.customerId));
    }
    if (options?.assignedTechnician) {
      query.where(
        eq(maintenanceSchedules.assignedTechnician, options.assignedTechnician),
      );
    }
    if (options?.status) {
      query.where(eq(maintenanceSchedules.status, options.status));
    }
    if (options?.frequency) {
      query.where(eq(maintenanceSchedules.frequency, options.frequency));
    }
    if (options?.search) {
      query.where(ilike(maintenanceSchedules.assetName, `%${options.search}%`));
    }

    const rows = await query.orderBy(desc(maintenanceSchedules.createdAt));
    return rows.map(toDomain);
  }

  async save(schedule: MaintenanceSchedule): Promise<void> {
    await db
      .insert(maintenanceSchedules)
      .values({
        id: schedule.id,
        scheduleNumber: schedule.scheduleNumber,
        customerId: schedule.customerId,
        assetName: schedule.assetName,
        serialNumber: schedule.serialNumber ?? null,
        frequency: schedule.frequency,
        nextVisitDate: schedule.nextVisitDate,
        assignedTechnician: schedule.assignedTechnician ?? null,
        status: schedule.status,
        notes: schedule.notes ?? null,
      })
      .onConflictDoUpdate({
        target: maintenanceSchedules.id,
        set: {
          assetName: schedule.assetName,
          serialNumber: schedule.serialNumber ?? null,
          frequency: schedule.frequency,
          nextVisitDate: schedule.nextVisitDate,
          assignedTechnician: schedule.assignedTechnician ?? null,
          status: schedule.status,
          notes: schedule.notes ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextScheduleNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(maintenanceSchedules);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `SCH-${year}-${num}`;
  }
}
