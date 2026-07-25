import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
} from './work-order';

export interface FindManyWorkOrdersOptions {
  serviceRequestId?: string;
  assignedTechnician?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  search?: string;
}

export interface WorkOrderRepository {
  findById(id: string): Promise<WorkOrder | null>;
  findByNumber(workOrderNumber: string): Promise<WorkOrder | null>;
  findMany(options?: FindManyWorkOrdersOptions): Promise<WorkOrder[]>;
  save(workOrder: WorkOrder): Promise<void>;
  generateNextWorkOrderNumber(): Promise<string>;
}
