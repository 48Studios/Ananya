import { ObjectId } from '@ananya/core';

export type TimeEntryStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TimeEntryProps {
  id: string;
  userId: string;
  taskId: string;
  date: Date;
  hours: number;
  description?: string;
  status: TimeEntryStatus;
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTimeEntryProps {
  userId: string;
  taskId: string;
  date: Date;
  hours: number;
  description?: string;
}

export class TimeEntry implements TimeEntryProps {
  public readonly id: string;
  public userId: string;
  public taskId: string;
  public date: Date;
  public hours: number;
  public description?: string;
  public status: TimeEntryStatus;
  public approvedBy?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: TimeEntryProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.taskId = props.taskId;
    this.date = props.date;
    this.hours = props.hours;
    this.description = props.description;
    this.status = props.status;
    this.approvedBy = props.approvedBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateTimeEntryProps): TimeEntry {
    if (!props.userId || props.userId.trim() === '') {
      throw new Error('Time entry requires a valid userId');
    }
    if (!props.taskId || props.taskId.trim() === '') {
      throw new Error('Time entry requires a valid taskId');
    }
    if (props.hours <= 0 || props.hours > 24) {
      throw new Error('Hours logged must be greater than 0 and at most 24 per entry');
    }

    const now = new Date();
    return new TimeEntry({
      id: ObjectId.generate().value,
      userId: props.userId,
      taskId: props.taskId,
      date: props.date,
      hours: props.hours,
      description: props.description?.trim(),
      status: 'SUBMITTED',
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: TimeEntryProps): TimeEntry {
    return new TimeEntry(props);
  }

  public approve(approverId: string): void {
    if (this.status === 'APPROVED') {
      throw new Error('Time entry is already approved');
    }
    this.status = 'APPROVED';
    this.approvedBy = approverId;
    this.updatedAt = new Date();
  }

  public reject(): void {
    if (this.status === 'APPROVED') {
      throw new Error('Approved time entries cannot be rejected');
    }
    this.status = 'REJECTED';
    this.updatedAt = new Date();
  }
}
