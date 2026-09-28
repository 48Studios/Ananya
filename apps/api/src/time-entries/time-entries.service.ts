import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  TimeEntry,
  TimeEntryRepository,
  TimeEntryStatus,
} from '@ananya/projects';
import { CreateTimeEntryDto, ApproveTimeEntryDto } from './dtos';
import { TasksService } from '../tasks/tasks.service';

export const TIME_ENTRY_REPOSITORY = 'TIME_ENTRY_REPOSITORY';

@Injectable()
export class TimeEntriesService {
  constructor(
    @Inject(TIME_ENTRY_REPOSITORY)
    private readonly timeEntryRepository: TimeEntryRepository,
    private readonly tasksService: TasksService,
  ) {}

  async create(dto: CreateTimeEntryDto): Promise<TimeEntry> {
    const task = await this.tasksService.findOne(dto.taskId);
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot log time entries against task in status ${task.status}`,
      );
    }

    const userId = dto.userId;
    if (!userId) {
      throw new BadRequestException(
        'User ID is required for time entry creation.',
      );
    }

    const timeEntry = TimeEntry.create({
      userId,
      taskId: dto.taskId,
      date: new Date(dto.date),
      hours: dto.hours,
      description: dto.description,
    });
    await this.timeEntryRepository.save(timeEntry);
    return timeEntry;
  }

  async findAll(
    userId?: string,
    taskId?: string,
    status?: TimeEntryStatus,
    startDate?: string,
    endDate?: string,
  ): Promise<TimeEntry[]> {
    return this.timeEntryRepository.findMany({
      userId,
      taskId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  async findOne(id: string): Promise<TimeEntry> {
    const timeEntry = await this.timeEntryRepository.findById(id);
    if (!timeEntry) {
      throw new NotFoundException(`Time entry with ID ${id} not found.`);
    }
    return timeEntry;
  }

  async approve(id: string, dto: ApproveTimeEntryDto): Promise<TimeEntry> {
    const approverId = dto.approverId;
    if (!approverId) {
      throw new BadRequestException('Approver ID is required.');
    }
    const timeEntry = await this.findOne(id);
    timeEntry.approve(approverId);
    await this.tasksService.addActualHours(timeEntry.taskId, timeEntry.hours);
    await this.timeEntryRepository.save(timeEntry);
    return timeEntry;
  }

  async reject(id: string): Promise<TimeEntry> {
    const timeEntry = await this.findOne(id);
    timeEntry.reject();
    await this.timeEntryRepository.save(timeEntry);
    return timeEntry;
  }
}
