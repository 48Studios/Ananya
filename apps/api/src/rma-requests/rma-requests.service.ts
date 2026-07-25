import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  RmaRequest,
  RmaRequestRepository,
  RmaStatus,
  RmaDisposition,
} from '@ananya/service';
import { CreateRmaRequestDto, InspectRmaDto } from './dtos';
import { CustomersService } from '../customers/customers.service';

export const RMA_REQUEST_REPOSITORY = 'RMA_REQUEST_REPOSITORY';

@Injectable()
export class RmaRequestsService {
  constructor(
    @Inject(RMA_REQUEST_REPOSITORY)
    private readonly rmaRequestRepository: RmaRequestRepository,
    private readonly customersService: CustomersService,
  ) {}

  async create(dto: CreateRmaRequestDto): Promise<RmaRequest> {
    await this.customersService.findOne(dto.customerId);
    const rmaNumber = await this.rmaRequestRepository.generateNextRmaNumber();
    const rma = RmaRequest.create({
      rmaNumber,
      customerId: dto.customerId,
      salesOrderId: dto.salesOrderId,
      itemDescription: dto.itemDescription,
      serialNumber: dto.serialNumber,
      reason: dto.reason,
    });
    await this.rmaRequestRepository.save(rma);
    return rma;
  }

  async findAll(
    customerId?: string,
    salesOrderId?: string,
    status?: RmaStatus,
    disposition?: RmaDisposition,
    search?: string,
  ): Promise<RmaRequest[]> {
    return this.rmaRequestRepository.findMany({
      customerId,
      salesOrderId,
      status,
      disposition,
      search,
    });
  }

  async findOne(id: string): Promise<RmaRequest> {
    const rma = await this.rmaRequestRepository.findById(id);
    if (!rma) {
      throw new NotFoundException(`RMA Request with ID ${id} not found.`);
    }
    return rma;
  }

  async approve(id: string): Promise<RmaRequest> {
    const rma = await this.findOne(id);
    rma.approve();
    await this.rmaRequestRepository.save(rma);
    return rma;
  }

  async receive(id: string): Promise<RmaRequest> {
    const rma = await this.findOne(id);
    rma.receive();
    await this.rmaRequestRepository.save(rma);
    return rma;
  }

  async inspect(id: string, dto: InspectRmaDto): Promise<RmaRequest> {
    const rma = await this.findOne(id);
    rma.inspect(dto.disposition, dto.notes);
    await this.rmaRequestRepository.save(rma);
    return rma;
  }

  async process(id: string): Promise<RmaRequest> {
    const rma = await this.findOne(id);
    rma.process();
    await this.rmaRequestRepository.save(rma);
    return rma;
  }

  async close(id: string): Promise<RmaRequest> {
    const rma = await this.findOne(id);
    rma.close();
    await this.rmaRequestRepository.save(rma);
    return rma;
  }

  async reject(id: string): Promise<RmaRequest> {
    const rma = await this.findOne(id);
    rma.reject();
    await this.rmaRequestRepository.save(rma);
    return rma;
  }
}
