import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  ServiceRequest,
  ServiceRequestRepository,
  ServiceRequestStatus,
  ServicePriority,
  ServiceCategory,
} from '@ananya/service';
import {
  CreateServiceRequestDto,
  AssignServiceRequestDto,
  DiagnoseServiceRequestDto,
} from './dtos';
import { CustomersService } from '../customers/customers.service';

export const SERVICE_REQUEST_REPOSITORY = 'SERVICE_REQUEST_REPOSITORY';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY)
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly customersService: CustomersService,
  ) {}

  async create(dto: CreateServiceRequestDto): Promise<ServiceRequest> {
    await this.customersService.findOne(dto.customerId);
    const serviceNumber =
      await this.serviceRequestRepository.generateNextServiceNumber();
    const request = ServiceRequest.create({
      serviceNumber,
      customerId: dto.customerId,
      salesOrderId: dto.salesOrderId,
      projectId: dto.projectId,
      componentId: dto.componentId,
      serialNumber: dto.serialNumber,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      category: dto.category,
    });
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async findAll(
    status?: ServiceRequestStatus,
    priority?: ServicePriority,
    category?: ServiceCategory,
    customerId?: string,
    assignedTechnician?: string,
    search?: string,
  ): Promise<ServiceRequest[]> {
    return this.serviceRequestRepository.findMany({
      status,
      priority,
      category,
      customerId,
      assignedTechnician,
      search,
    });
  }

  async findOne(id: string): Promise<ServiceRequest> {
    const request = await this.serviceRequestRepository.findById(id);
    if (!request) {
      throw new NotFoundException(`Service Request with ID ${id} not found.`);
    }
    return request;
  }

  async assign(
    id: string,
    dto: AssignServiceRequestDto,
  ): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.assign(dto.technician);
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async diagnose(
    id: string,
    dto: DiagnoseServiceRequestDto,
  ): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.diagnose(dto.notes);
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async setWaitingParts(id: string): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.setWaitingParts();
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async startRepair(id: string): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.startRepair();
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async complete(id: string): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.complete();
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async close(id: string): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.close();
    await this.serviceRequestRepository.save(request);
    return request;
  }

  async cancel(id: string): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    request.cancel();
    await this.serviceRequestRepository.save(request);
    return request;
  }
}
