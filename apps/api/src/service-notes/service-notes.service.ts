import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ServiceNote, ServiceNoteRepository } from '@ananya/service';
import { CreateServiceNoteDto } from './dtos';

export const SERVICE_NOTE_REPOSITORY = 'SERVICE_NOTE_REPOSITORY';

@Injectable()
export class ServiceNotesService {
  constructor(
    @Inject(SERVICE_NOTE_REPOSITORY)
    private readonly serviceNoteRepository: ServiceNoteRepository,
  ) {}

  async create(dto: CreateServiceNoteDto): Promise<ServiceNote> {
    const note = ServiceNote.create({
      serviceRequestId: dto.serviceRequestId,
      workOrderId: dto.workOrderId,
      warrantyClaimId: dto.warrantyClaimId,
      author: dto.author,
      body: dto.body,
    });
    await this.serviceNoteRepository.save(note);
    return note;
  }

  async findAll(
    serviceRequestId?: string,
    workOrderId?: string,
    warrantyClaimId?: string,
  ): Promise<ServiceNote[]> {
    return this.serviceNoteRepository.findMany({
      serviceRequestId,
      workOrderId,
      warrantyClaimId,
    });
  }

  async findOne(id: string): Promise<ServiceNote> {
    const note = await this.serviceNoteRepository.findById(id);
    if (!note) {
      throw new NotFoundException(`Service Note with ID ${id} not found.`);
    }
    return note;
  }
}
