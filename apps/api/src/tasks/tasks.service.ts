import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Task,
  TaskRepository,
  TaskStatus,
  TaskPriority,
} from '@ananya/projects';
import { CreateTaskDto, AssignTaskDto } from './dtos';
import { ProjectsService } from '../projects/projects.service';

export const TASK_REPOSITORY = 'TASK_REPOSITORY';

@Injectable()
export class TasksService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: TaskRepository,
    private readonly projectsService: ProjectsService,
  ) {}

  async create(dto: CreateTaskDto): Promise<Task> {
    const project = await this.projectsService.findOne(dto.projectId);
    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot add tasks to project in status ${project.status}`,
      );
    }

    const taskNumber = await this.taskRepository.generateNextTaskNumber();
    const task = Task.create({
      taskNumber,
      projectId: dto.projectId,
      title: dto.title,
      description: dto.description,
      assignedUser: dto.assignedUser,
      estimatedHours: dto.estimatedHours,
      priority: dto.priority,
    });
    await this.taskRepository.save(task);
    return task;
  }

  async findAll(
    projectId?: string,
    assignedUser?: string,
    status?: TaskStatus,
    priority?: TaskPriority,
    search?: string,
  ): Promise<Task[]> {
    return this.taskRepository.findMany({
      projectId,
      assignedUser,
      status,
      priority,
      search,
    });
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found.`);
    }
    return task;
  }

  async assign(id: string, dto: AssignTaskDto): Promise<Task> {
    const task = await this.findOne(id);
    task.assign(dto.userId);
    await this.taskRepository.save(task);
    return task;
  }

  async start(id: string): Promise<Task> {
    const task = await this.findOne(id);
    task.start();
    await this.taskRepository.save(task);
    return task;
  }

  async block(id: string): Promise<Task> {
    const task = await this.findOne(id);
    task.block();
    await this.taskRepository.save(task);
    return task;
  }

  async complete(id: string): Promise<Task> {
    const task = await this.findOne(id);
    task.complete();
    await this.taskRepository.save(task);
    return task;
  }

  async cancel(id: string): Promise<Task> {
    const task = await this.findOne(id);
    task.cancel();
    await this.taskRepository.save(task);
    return task;
  }

  async addActualHours(id: string, hours: number): Promise<Task> {
    const task = await this.findOne(id);
    task.addActualHours(hours);
    await this.taskRepository.save(task);
    return task;
  }
}
