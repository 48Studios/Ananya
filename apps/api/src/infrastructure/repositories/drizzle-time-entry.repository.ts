import { db } from '@ananya/database';
import { timeEntries } from '@ananya/database/schema';
import { eq, desc, gte, lte } from '@ananya/database/query';
import type { TimeEntryRecord } from '@ananya/database/schema';
import {
  TimeEntry,
  type TimeEntryRepository,
  type TimeEntryStatus,
  type FindManyTimeEntriesOptions,
} from '@ananya/projects';

function toDomain(row: TimeEntryRecord): TimeEntry {
  return TimeEntry.rehydrate({
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    date: row.date,
    hours: parseFloat(row.hours),
    description: row.description ?? undefined,
    status: row.status as TimeEntryStatus,
    approvedBy: row.approvedBy ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleTimeEntryRepository implements TimeEntryRepository {
  async findById(id: string): Promise<TimeEntry | null> {
    const [row] = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyTimeEntriesOptions): Promise<TimeEntry[]> {
    const query = db.select().from(timeEntries);

    if (options?.userId) {
      query.where(eq(timeEntries.userId, options.userId));
    }
    if (options?.taskId) {
      query.where(eq(timeEntries.taskId, options.taskId));
    }
    if (options?.status) {
      query.where(eq(timeEntries.status, options.status));
    }
    if (options?.startDate) {
      query.where(gte(timeEntries.date, options.startDate));
    }
    if (options?.endDate) {
      query.where(lte(timeEntries.date, options.endDate));
    }

    const rows = await query.orderBy(desc(timeEntries.date));
    return rows.map(toDomain);
  }

  async save(timeEntry: TimeEntry): Promise<void> {
    await db
      .insert(timeEntries)
      .values({
        id: timeEntry.id,
        userId: timeEntry.userId,
        taskId: timeEntry.taskId,
        date: timeEntry.date,
        hours: timeEntry.hours.toString(),
        description: timeEntry.description ?? null,
        status: timeEntry.status,
        approvedBy: timeEntry.approvedBy ?? null,
      })
      .onConflictDoUpdate({
        target: timeEntries.id,
        set: {
          hours: timeEntry.hours.toString(),
          description: timeEntry.description ?? null,
          status: timeEntry.status,
          approvedBy: timeEntry.approvedBy ?? null,
          updatedAt: new Date(),
        },
      });
  }
}
