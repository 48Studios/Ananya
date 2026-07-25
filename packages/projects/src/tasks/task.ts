import { ObjectId } from '@ananya/core';

export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'DONE'
  | 'CANCELLED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskAssignmentProps {
  id: string;
  taskId: string;
  userId: string;
  assignedAt: Date;
}

export interface TaskProps {
  id: string;
  taskNumber: string;
  projectId: string;
  title: string;
  description?: string;
  assignedUser?: string;
  estimatedHours: number;
  actualHours: number;
  priority: TaskPriority;
  status: TaskStatus;
  assignments: TaskAssignmentProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskProps {
  taskNumber: string;
  projectId: string;
  title: string;
  description?: string;
  assignedUser?: string;
  estimatedHours: number;
  priority?: TaskPriority;
}

export class Task implements TaskProps {
  public readonly id: string;
  public taskNumber: string;
  public projectId: string;
  public title: string;
  public description?: string;
  public assignedUser?: string;
  public estimatedHours: number;
  public actualHours: number;
  public priority: TaskPriority;
  public status: TaskStatus;
  public assignments: TaskAssignmentProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: TaskProps) {
    this.id = props.id;
    this.taskNumber = props.taskNumber;
    this.projectId = props.projectId;
    this.title = props.title;
    this.description = props.description;
    this.assignedUser = props.assignedUser;
    this.estimatedHours = props.estimatedHours;
    this.actualHours = props.actualHours;
    this.priority = props.priority;
    this.status = props.status;
    this.assignments = props.assignments;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateTaskProps): Task {
    if (!props.title || props.title.trim() === '') {
      throw new Error('Task title is required');
    }
    if (!props.projectId || props.projectId.trim() === '') {
      throw new Error('Task requires a valid projectId');
    }
    if (props.estimatedHours < 0) {
      throw new Error('Estimated hours cannot be negative');
    }

    const now = new Date();
    const taskId = ObjectId.generate().value;
    const assignments: TaskAssignmentProps[] = [];

    if (props.assignedUser) {
      assignments.push({
        id: ObjectId.generate().value,
        taskId,
        userId: props.assignedUser,
        assignedAt: now,
      });
    }

    return new Task({
      id: taskId,
      taskNumber: props.taskNumber,
      projectId: props.projectId,
      title: props.title.trim(),
      description: props.description?.trim(),
      assignedUser: props.assignedUser,
      estimatedHours: props.estimatedHours,
      actualHours: 0,
      priority: props.priority || 'MEDIUM',
      status: 'TODO',
      assignments,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: TaskProps): Task {
    return new Task(props);
  }

  public assign(userId: string): void {
    if (this.status === 'DONE' || this.status === 'CANCELLED') {
      throw new Error(`Cannot assign user to task in status ${this.status}`);
    }
    this.assignedUser = userId;
    this.assignments.push({
      id: ObjectId.generate().value,
      taskId: this.id,
      userId,
      assignedAt: new Date(),
    });
    this.updatedAt = new Date();
  }

  public start(): void {
    if (this.status === 'DONE' || this.status === 'CANCELLED') {
      throw new Error(`Cannot start task in status ${this.status}`);
    }
    this.status = 'IN_PROGRESS';
    this.updatedAt = new Date();
  }

  public block(): void {
    if (this.status !== 'IN_PROGRESS' && this.status !== 'TODO') {
      throw new Error(`Cannot block task in status ${this.status}`);
    }
    this.status = 'BLOCKED';
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status === 'CANCELLED') {
      throw new Error('Cancelled tasks cannot be completed');
    }
    this.status = 'DONE';
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === 'DONE') {
      throw new Error('Completed tasks cannot be cancelled');
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }

  public addActualHours(hours: number): void {
    if (this.status === 'DONE' || this.status === 'CANCELLED') {
      throw new Error(`Cannot log hours against task in status ${this.status}`);
    }
    if (hours <= 0) {
      throw new Error('Hours logged must be positive');
    }
    this.actualHours += hours;
    this.updatedAt = new Date();
  }
}
