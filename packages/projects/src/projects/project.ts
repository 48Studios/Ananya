import { ObjectId } from '@ananya/core';

export type ProjectStatus =
  | 'PLANNING'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED';

export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type MilestoneStatus = 'OPEN' | 'COMPLETED';

export interface MilestoneProps {
  id: string;
  projectId: string;
  name: string;
  dueDate: Date;
  status: MilestoneStatus;
  completionPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectProps {
  id: string;
  projectNumber: string;
  name: string;
  customerId: string;
  salesOrderId: string;
  projectManager: string;
  startDate: Date;
  targetCompletionDate: Date;
  priority: ProjectPriority;
  status: ProjectStatus;
  milestones: MilestoneProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectProps {
  projectNumber: string;
  name: string;
  customerId: string;
  salesOrderId: string;
  projectManager: string;
  startDate: Date;
  targetCompletionDate: Date;
  priority?: ProjectPriority;
}

export interface AddMilestoneProps {
  name: string;
  dueDate: Date;
  completionPercentage?: number;
}

export class Project implements ProjectProps {
  public readonly id: string;
  public projectNumber: string;
  public name: string;
  public customerId: string;
  public salesOrderId: string;
  public projectManager: string;
  public startDate: Date;
  public targetCompletionDate: Date;
  public priority: ProjectPriority;
  public status: ProjectStatus;
  public milestones: MilestoneProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ProjectProps) {
    this.id = props.id;
    this.projectNumber = props.projectNumber;
    this.name = props.name;
    this.customerId = props.customerId;
    this.salesOrderId = props.salesOrderId;
    this.projectManager = props.projectManager;
    this.startDate = props.startDate;
    this.targetCompletionDate = props.targetCompletionDate;
    this.priority = props.priority;
    this.status = props.status;
    this.milestones = props.milestones;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateProjectProps): Project {
    if (!props.name || props.name.trim() === '') {
      throw new Error('Project name is required');
    }
    if (!props.customerId || props.customerId.trim() === '') {
      throw new Error('Project requires a valid customerId');
    }
    if (!props.salesOrderId || props.salesOrderId.trim() === '') {
      throw new Error('Project requires a valid salesOrderId');
    }
    if (props.targetCompletionDate < props.startDate) {
      throw new Error('Target completion date cannot be before start date');
    }

    const now = new Date();
    return new Project({
      id: ObjectId.generate().value,
      projectNumber: props.projectNumber,
      name: props.name.trim(),
      customerId: props.customerId,
      salesOrderId: props.salesOrderId,
      projectManager: props.projectManager,
      startDate: props.startDate,
      targetCompletionDate: props.targetCompletionDate,
      priority: props.priority || 'MEDIUM',
      status: 'PLANNING',
      milestones: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: ProjectProps): Project {
    return new Project(props);
  }

  public start(): void {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot start project in status ${this.status}`);
    }
    this.status = 'ACTIVE';
    this.updatedAt = new Date();
  }

  public pause(): void {
    if (this.status !== 'ACTIVE') {
      throw new Error(`Only ACTIVE projects can be paused (current: ${this.status})`);
    }
    this.status = 'ON_HOLD';
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status === 'CANCELLED') {
      throw new Error('Cancelled projects cannot be completed');
    }
    this.status = 'COMPLETED';
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === 'COMPLETED') {
      throw new Error('Completed projects cannot be cancelled');
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }

  public addMilestone(props: AddMilestoneProps): MilestoneProps {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot add milestones to project in status ${this.status}`);
    }
    if (!props.name || props.name.trim() === '') {
      throw new Error('Milestone name is required');
    }

    const now = new Date();
    const milestone: MilestoneProps = {
      id: ObjectId.generate().value,
      projectId: this.id,
      name: props.name.trim(),
      dueDate: props.dueDate,
      status: 'OPEN',
      completionPercentage: props.completionPercentage ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    this.milestones.push(milestone);
    this.updatedAt = now;
    return milestone;
  }

  public completeMilestone(milestoneId: string): void {
    const milestone = this.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`Milestone with ID ${milestoneId} not found in project`);
    }
    milestone.status = 'COMPLETED';
    milestone.completionPercentage = 100;
    milestone.updatedAt = new Date();
    this.updatedAt = new Date();
  }
}
