import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const PROJECT_REPOSITORY = 'PROJECT_REPOSITORY';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly customersService: CustomersService,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
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

    // Validate available stock at the selected location
    const projection =
      await this.inventoryProjectionsService.getByComponentAndLocation(
        dto.componentId,
        dto.locationId,
      );
    const availableStock = projection ? projection.quantity : 0;
    if (availableStock < dto.quantity) {
      throw new BadRequestException(
        `Cannot allocate ${dto.quantity} units. Available stock at selected location is only ${availableStock} ${dto.unitOfMeasure || 'units'}.`,
      );
    }

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

    // Validate available stock at the selected location before issuing
    const projection =
      await this.inventoryProjectionsService.getByComponentAndLocation(
        dto.componentId,
        dto.locationId,
      );
    const availableStock = projection ? projection.quantity : 0;
    if (availableStock < dto.quantity) {
      throw new BadRequestException(
        `Cannot issue ${dto.quantity} units. Available stock at selected location is only ${availableStock}.`,
      );
    }

    const mat = project.issueMaterial(
      dto.componentId,
      dto.locationId,
      dto.quantity,
      dto.performedBy,
    );

    // Log physical stock deduction transaction
    await this.inventoryTransactionsService.create({
      transactionType: 'Issue',
      componentId: dto.componentId,
      sourceLocationId: dto.locationId,
      quantity: dto.quantity,
      unitOfMeasure: mat.unitOfMeasure || 'pcs',
      reference: project.projectNumber,
      reason: `Project material issue (${project.projectNumber})`,
      createdBy: dto.performedBy || project.owner || 'User',
    });

    await this.projectRepository.save(project);
    await this.inventoryProjectionsService.rebuild();
    return project;
  }

  async returnMaterial(id: string, dto: ReturnMaterialDto): Promise<Project> {
    const project = await this.findOne(id);
    const mat = project.returnMaterial(
      dto.componentId,
      dto.locationId,
      dto.quantity,
      dto.performedBy,
    );

    // Log physical stock return transaction back into location
    await this.inventoryTransactionsService.create({
      transactionType: 'Return',
      componentId: dto.componentId,
      destinationLocationId: dto.locationId,
      quantity: dto.quantity,
      unitOfMeasure: mat.unitOfMeasure || 'pcs',
      reference: project.projectNumber,
      reason: `Project material return (${project.projectNumber})`,
      createdBy: dto.performedBy || project.owner || 'User',
    });

    await this.projectRepository.save(project);
    await this.inventoryProjectionsService.rebuild();
    return project;
  }
}
