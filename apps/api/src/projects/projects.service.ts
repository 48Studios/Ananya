import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Project,
  ProjectRepository,
  ProjectStatus,
  ProjectPriority,
  MilestoneProps,
} from '@ananya/projects';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddMilestoneDto,
  AllocateMaterialDto,
  IssueMaterialDto,
  ReturnMaterialDto,
} from './dtos';
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
    if (dto.customerId) {
      await this.customersService.findOne(dto.customerId);
    }
    if (dto.salesOrderId) {
      await this.salesOrdersService.findOne(dto.salesOrderId);
    }

    const projectNumber =
      await this.projectRepository.generateNextProjectNumber();
    const project = Project.create({
      projectNumber,
      name: dto.name,
      projectType: dto.projectType,
      description: dto.description,
      owner: dto.owner,
      projectManager: dto.projectManager,
      customerId: dto.customerId,
      salesOrderId: dto.salesOrderId,
      startDate: new Date(dto.startDate),
      targetCompletionDate: new Date(dto.targetCompletionDate),
      priority: dto.priority,
      performedBy: dto.performedBy,
    });
    await this.projectRepository.save(project);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);

    if (dto.customerId) {
      await this.customersService.findOne(dto.customerId);
    }
    if (dto.salesOrderId) {
      await this.salesOrdersService.findOne(dto.salesOrderId);
    }

    project.update(
      {
        name: dto.name,
        projectType: dto.projectType,
        description: dto.description,
        owner: dto.owner,
        projectManager: dto.projectManager,
        customerId: dto.customerId,
        salesOrderId: dto.salesOrderId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetCompletionDate: dto.targetCompletionDate
          ? new Date(dto.targetCompletionDate)
          : undefined,
        priority: dto.priority,
      },
      dto.performedBy,
    );
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

  async start(id: string, performedBy?: string): Promise<Project> {
    const project = await this.findOne(id);
    project.start(performedBy);
    await this.projectRepository.save(project);
    return project;
  }

  async pause(id: string, performedBy?: string): Promise<Project> {
    const project = await this.findOne(id);
    project.pause(performedBy);
    await this.projectRepository.save(project);
    return project;
  }

  async complete(id: string, performedBy?: string): Promise<Project> {
    const project = await this.findOne(id);
    project.complete(performedBy);
    await this.projectRepository.save(project);
    return project;
  }

  async archive(id: string, performedBy?: string): Promise<Project> {
    const project = await this.findOne(id);
    project.archive(performedBy);
    await this.projectRepository.save(project);
    return project;
  }

  async cancel(id: string, performedBy?: string): Promise<Project> {
    const project = await this.findOne(id);
    project.cancel(performedBy);
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

  async completeMilestone(
    id: string,
    milestoneId: string,
    performedBy?: string,
  ): Promise<Project> {
    const project = await this.findOne(id);
    project.completeMilestone(milestoneId, performedBy);
    await this.projectRepository.save(project);
    return project;
  }

  async allocateMaterial(
    id: string,
    dto: AllocateMaterialDto,
  ): Promise<Project> {
    const project = await this.findOne(id);
    project.allocateMaterial(
      dto.componentId,
      dto.locationId,
      dto.quantity,
      dto.unitOfMeasure,
      dto.notes,
      dto.performedBy,
    );
    await this.projectRepository.save(project);
    return project;
  }

  async issueMaterial(id: string, dto: IssueMaterialDto): Promise<Project> {
    const project = await this.findOne(id);
    project.issueMaterial(
      dto.componentId,
      dto.locationId,
      dto.quantity,
      dto.performedBy,
    );
    await this.projectRepository.save(project);
    return project;
  }

  async returnMaterial(id: string, dto: ReturnMaterialDto): Promise<Project> {
    const project = await this.findOne(id);
    project.returnMaterial(
      dto.componentId,
      dto.locationId,
      dto.quantity,
      dto.performedBy,
    );
    await this.projectRepository.save(project);
    return project;
  }
}
