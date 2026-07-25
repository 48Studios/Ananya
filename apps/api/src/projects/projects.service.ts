import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Project,
  ProjectRepository,
  ProjectStatus,
  ProjectPriority,
  MilestoneProps,
} from '@ananya/projects';
import { CreateProjectDto, AddMilestoneDto } from './dtos';
import { CustomersService } from '../customers/customers.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';

export const PROJECT_REPOSITORY = 'PROJECT_REPOSITORY';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly customersService: CustomersService,
    private readonly salesOrdersService: SalesOrdersService,
  ) {}

  async create(dto: CreateProjectDto): Promise<Project> {
    await this.customersService.findOne(dto.customerId);
    await this.salesOrdersService.findOne(dto.salesOrderId);

    const projectNumber =
      await this.projectRepository.generateNextProjectNumber();
    const project = Project.create({
      projectNumber,
      name: dto.name,
      customerId: dto.customerId,
      salesOrderId: dto.salesOrderId,
      projectManager: dto.projectManager,
      startDate: new Date(dto.startDate),
      targetCompletionDate: new Date(dto.targetCompletionDate),
      priority: dto.priority,
    });
    await this.projectRepository.save(project);
    return project;
  }

  async findAll(
    status?: ProjectStatus,
    priority?: ProjectPriority,
    customerId?: string,
    salesOrderId?: string,
    projectManager?: string,
    search?: string,
  ): Promise<Project[]> {
    return this.projectRepository.findMany({
      status,
      priority,
      customerId,
      salesOrderId,
      projectManager,
      search,
    });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found.`);
    }
    return project;
  }

  async start(id: string): Promise<Project> {
    const project = await this.findOne(id);
    project.start();
    await this.projectRepository.save(project);
    return project;
  }

  async pause(id: string): Promise<Project> {
    const project = await this.findOne(id);
    project.pause();
    await this.projectRepository.save(project);
    return project;
  }

  async complete(id: string): Promise<Project> {
    const project = await this.findOne(id);
    project.complete();
    await this.projectRepository.save(project);
    return project;
  }

  async cancel(id: string): Promise<Project> {
    const project = await this.findOne(id);
    project.cancel();
    await this.projectRepository.save(project);
    return project;
  }

  async addMilestone(
    id: string,
    dto: AddMilestoneDto,
  ): Promise<MilestoneProps> {
    const project = await this.findOne(id);
    const milestone = project.addMilestone({
      name: dto.name,
      dueDate: new Date(dto.dueDate),
      completionPercentage: dto.completionPercentage,
    });
    await this.projectRepository.save(project);
    return milestone;
  }

  async completeMilestone(id: string, milestoneId: string): Promise<Project> {
    const project = await this.findOne(id);
    project.completeMilestone(milestoneId);
    await this.projectRepository.save(project);
    return project;
  }
}
