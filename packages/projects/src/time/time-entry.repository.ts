import { TimeEntry, TimeEntryStatus } from './time-entry';

export interface FindManyTimeEntriesOptions {
  userId?: string;
  taskId?: string;
  status?: TimeEntryStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface TimeEntryRepository {
  findById(id: string): Promise<TimeEntry | null>;
  findMany(options?: FindManyTimeEntriesOptions): Promise<TimeEntry[]>;
  save(timeEntry: TimeEntry): Promise<void>;
}
