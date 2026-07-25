import { ObjectId } from '@ananya/core';

export type ActivityType = 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'DEMO';

export type ActivityStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface ActivityProps {
  id: string;
  type: ActivityType;
  subject: string;
  dueDate: Date;
  owner: string;
  status: ActivityStatus;
  relatedLeadId?: string;
  relatedOpportunityId?: string;
  relatedAccountId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateActivityProps {
  type: ActivityType;
  subject: string;
  dueDate: Date;
  owner: string;
  relatedLeadId?: string;
  relatedOpportunityId?: string;
  relatedAccountId?: string;
}

export class Activity implements ActivityProps {
  public readonly id: string;
  public type: ActivityType;
  public subject: string;
  public dueDate: Date;
  public owner: string;
  public status: ActivityStatus;
  public relatedLeadId?: string;
  public relatedOpportunityId?: string;
  public relatedAccountId?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ActivityProps) {
    this.id = props.id;
    this.type = props.type;
    this.subject = props.subject;
    this.dueDate = props.dueDate;
    this.owner = props.owner;
    this.status = props.status;
    this.relatedLeadId = props.relatedLeadId;
    this.relatedOpportunityId = props.relatedOpportunityId;
    this.relatedAccountId = props.relatedAccountId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateActivityProps): Activity {
    if (!props.subject || props.subject.trim() === '') {
      throw new Error('Activity subject is required');
    }

    const now = new Date();
    return new Activity({
      id: ObjectId.generate().value,
      type: props.type,
      subject: props.subject.trim(),
      dueDate: props.dueDate,
      owner: props.owner,
      status: 'SCHEDULED',
      relatedLeadId: props.relatedLeadId,
      relatedOpportunityId: props.relatedOpportunityId,
      relatedAccountId: props.relatedAccountId,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: ActivityProps): Activity {
    return new Activity(props);
  }

  public complete(): void {
    if (this.status === 'CANCELLED') {
      throw new Error('Cancelled activities cannot be completed');
    }
    this.status = 'COMPLETED';
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === 'COMPLETED') {
      throw new Error('Completed activities cannot be cancelled');
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }
}
