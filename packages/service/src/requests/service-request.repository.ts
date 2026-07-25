import {
  ServiceRequest,
  ServiceRequestStatus,
  ServicePriority,
  ServiceCategory,
} from './service-request';

export interface FindManyServiceRequestsOptions {
  status?: ServiceRequestStatus;
  priority?: ServicePriority;
  category?: ServiceCategory;
  customerId?: string;
  assignedTechnician?: string;
  search?: string;
}

export interface ServiceRequestRepository {
  findById(id: string): Promise<ServiceRequest | null>;
  findByNumber(serviceNumber: string): Promise<ServiceRequest | null>;
  findMany(options?: FindManyServiceRequestsOptions): Promise<ServiceRequest[]>;
  save(request: ServiceRequest): Promise<void>;
  generateNextServiceNumber(): Promise<string>;
}
