import { ObjectId } from '@ananya/core';

export type ServiceRequestStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'DIAGNOSING'
  | 'WAITING_PARTS'
  | 'REPAIRING'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export type ServicePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ServiceCategory =
  | 'HARDWARE'
  | 'SOFTWARE'
  | 'MAINTENANCE'
  | 'INSTALLATION'
  | 'INSPECTION';

export interface ServiceRequestProps {
  id: string;
  serviceNumber: string;
  customerId: string;
  salesOrderId?: string;
  projectId?: string;
  componentId?: string;
  serialNumber?: string;
  title: string;
  description?: string;
  priority: ServicePriority;
  category: ServiceCategory;
  status: ServiceRequestStatus;
  assignedTechnician?: string;
  diagnosticNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceRequestProps {
  serviceNumber: string;
  customerId: string;
  salesOrderId?: string;
  projectId?: string;
  componentId?: string;
  serialNumber?: string;
  title: string;
  description?: string;
  priority?: ServicePriority;
  category: ServiceCategory;
}

export class ServiceRequest implements ServiceRequestProps {
  public readonly id: string;
  public serviceNumber: string;
  public customerId: string;
  public salesOrderId?: string;
  public projectId?: string;
  public componentId?: string;
  public serialNumber?: string;
  public title: string;
  public description?: string;
  public priority: ServicePriority;
  public category: ServiceCategory;
  public status: ServiceRequestStatus;
  public assignedTechnician?: string;
  public diagnosticNotes?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ServiceRequestProps) {
    this.id = props.id;
    this.serviceNumber = props.serviceNumber;
    this.customerId = props.customerId;
    this.salesOrderId = props.salesOrderId;
    this.projectId = props.projectId;
    this.componentId = props.componentId;
    this.serialNumber = props.serialNumber;
    this.title = props.title;
    this.description = props.description;
    this.priority = props.priority;
    this.category = props.category;
    this.status = props.status;
    this.assignedTechnician = props.assignedTechnician;
    this.diagnosticNotes = props.diagnosticNotes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateServiceRequestProps): ServiceRequest {
    if (!props.customerId || props.customerId.trim() === '') {
      throw new Error('Service Request requires a valid customerId');
    }
    if (!props.title || props.title.trim() === '') {
      throw new Error('Service Request title is required');
    }

    const now = new Date();
    return new ServiceRequest({
      id: ObjectId.generate().value,
      serviceNumber: props.serviceNumber,
      customerId: props.customerId,
      salesOrderId: props.salesOrderId,
      projectId: props.projectId,
      componentId: props.componentId,
      serialNumber: props.serialNumber,
      title: props.title.trim(),
      description: props.description?.trim(),
      priority: props.priority || 'MEDIUM',
      category: props.category,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: ServiceRequestProps): ServiceRequest {
    return new ServiceRequest(props);
  }

  public assign(technician: string): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot assign technician to request in status ${this.status}`);
    }
    this.assignedTechnician = technician;
    this.status = 'ASSIGNED';
    this.updatedAt = new Date();
  }

  public diagnose(notes: string): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot record diagnosis on request in status ${this.status}`);
    }
    this.diagnosticNotes = notes.trim();
    this.status = 'DIAGNOSING';
    this.updatedAt = new Date();
  }

  public setWaitingParts(): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot set waiting parts on request in status ${this.status}`);
    }
    this.status = 'WAITING_PARTS';
    this.updatedAt = new Date();
  }

  public startRepair(): void {
    if (this.status === 'CLOSED' || this.status === 'CANCELLED') {
      throw new Error(`Cannot start repair on request in status ${this.status}`);
    }
    this.status = 'REPAIRING';
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status === 'CANCELLED' || this.status === 'CLOSED') {
      throw new Error(`Cannot complete request in status ${this.status}`);
    }
    this.status = 'COMPLETED';
    this.updatedAt = new Date();
  }

  public close(): void {
    if (this.status === 'CANCELLED') {
      throw new Error('Cancelled service requests cannot be closed');
    }
    this.status = 'CLOSED';
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === 'CLOSED') {
      throw new Error('Closed service requests cannot be cancelled');
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }
}
