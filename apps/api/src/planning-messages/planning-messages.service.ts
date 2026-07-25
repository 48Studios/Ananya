import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  PlanningMessage,
  PlanningMessageRepository,
  MessageSeverity,
} from '@ananya/mrp';
import { CreatePlanningMessageDto } from './dtos';

export const PLANNING_MESSAGE_REPOSITORY = 'PLANNING_MESSAGE_REPOSITORY';

@Injectable()
export class PlanningMessagesService {
  constructor(
    @Inject(PLANNING_MESSAGE_REPOSITORY)
    private readonly planningMessageRepository: PlanningMessageRepository,
  ) {}

  async create(dto: CreatePlanningMessageDto): Promise<PlanningMessage> {
    const msg = PlanningMessage.create({
      planningRunId: dto.planningRunId,
      severity: dto.severity,
      message: dto.message,
    });
    await this.planningMessageRepository.save(msg);
    return msg;
  }

  async findAll(
    planningRunId?: string,
    severity?: MessageSeverity,
  ): Promise<PlanningMessage[]> {
    return this.planningMessageRepository.findMany({
      planningRunId,
      severity,
    });
  }

  async findOne(id: string): Promise<PlanningMessage> {
    const msg = await this.planningMessageRepository.findById(id);
    if (!msg) {
      throw new NotFoundException(`Planning Message with ID ${id} not found.`);
    }
    return msg;
  }
}
