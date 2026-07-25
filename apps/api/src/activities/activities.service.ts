import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Activity,
  ActivityRepository,
  ActivityType,
  ActivityStatus,
} from '@ananya/crm';
import { CreateActivityDto } from './dtos';

export const ACTIVITY_REPOSITORY = 'ACTIVITY_REPOSITORY';

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: ActivityRepository,
  ) {}

  async create(dto: CreateActivityDto): Promise<Activity> {
    const activity = Activity.create({
      type: dto.type,
      subject: dto.subject,
      dueDate: new Date(dto.dueDate),
      owner: dto.owner,
      relatedLeadId: dto.relatedLeadId,
      relatedAccountId: dto.relatedAccountId,
      relatedOpportunityId: dto.relatedOpportunityId,
    });
    await this.activityRepository.save(activity);
    return activity;
  }

  async findAll(
    type?: ActivityType,
    status?: ActivityStatus,
    owner?: string,
    relatedLeadId?: string,
    relatedAccountId?: string,
    relatedOpportunityId?: string,
  ): Promise<Activity[]> {
    return this.activityRepository.findMany({
      type,
      status,
      owner,
      relatedLeadId,
      relatedAccountId,
      relatedOpportunityId,
    });
  }

  async findOne(id: string): Promise<Activity> {
    const activity = await this.activityRepository.findById(id);
    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found.`);
    }
    return activity;
  }

  async complete(id: string): Promise<Activity> {
    const activity = await this.findOne(id);
    activity.complete();
    await this.activityRepository.save(activity);
    return activity;
  }

  async cancel(id: string): Promise<Activity> {
    const activity = await this.findOne(id);
    activity.cancel();
    await this.activityRepository.save(activity);
    return activity;
  }
}
