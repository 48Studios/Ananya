import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  WorkOrder,
  WorkOrderRepository,
  WorkOrderStatus,
  WorkOrderPriority,
} from '@ananya/service';
import {
  CreateWorkOrderDto,
  AssignWorkOrderDto,
  LogWorkOrderHoursDto,
} from './dtos';
import { ServiceRequestsService } from '../service-requests/service-requests.service';

export const WORK_ORDER_REPOSITORY = 'WORK_ORDER_REPOSITORY';

@Injectable()
export class WorkOrdersService {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY)
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly serviceRequestsService: ServiceRequestsService,
  ) {}

  async create(dto: CreateWorkOrderDto): Promise<WorkOrder> {
    const srv = await this.serviceRequestsService.findOne(dto.serviceRequestId);
    if (srv.status === 'CLOSED' || srv.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot create work order for service request in status ${srv.status}`,
      );
    }

    const workOrderNumber =
      await this.workOrderRepository.generateNextWorkOrderNumber();
    const workOrder = WorkOrder.create({
      workOrderNumber,
      serviceRequestId: dto.serviceRequestId,
      assignedTechnician: dto.assignedTechnician,
      title: dto.title,
      description: dto.description,
      plannedHours: dto.plannedHours,
      priority: dto.priority,
    });
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }

  async findAll(
    serviceRequestId?: string,
    assignedTechnician?: string,
    status?: WorkOrderStatus,
    priority?: WorkOrderPriority,
    search?: string,
  ): Promise<WorkOrder[]> {
    return this.workOrderRepository.findMany({
      serviceRequestId,
      assignedTechnician,
      status,
      priority,
      search,
    });
  }

  async findOne(id: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepository.findById(id);
    if (!workOrder) {
      throw new NotFoundException(`Work Order with ID ${id} not found.`);
    }
    return workOrder;
  }

  async assign(id: string, dto: AssignWorkOrderDto): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    workOrder.assign(dto.technician);
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }

  async start(id: string): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    workOrder.start();
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }

  async pause(id: string): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    workOrder.pause();
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }

  async logHours(id: string, dto: LogWorkOrderHoursDto): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    workOrder.logHours(dto.hours);
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }

  async complete(id: string): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    workOrder.complete();
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }

  async cancel(id: string): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    workOrder.cancel();
    await this.workOrderRepository.save(workOrder);
    return workOrder;
  }
}
