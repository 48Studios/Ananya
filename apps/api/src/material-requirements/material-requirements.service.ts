import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  MaterialRequirement,
  MaterialRequirementRepository,
  RequirementSource,
} from '@ananya/mrp';
import { CreateMaterialRequirementDto } from './dtos';

export const MATERIAL_REQUIREMENT_REPOSITORY =
  'MATERIAL_REQUIREMENT_REPOSITORY';

@Injectable()
export class MaterialRequirementsService {
  constructor(
    @Inject(MATERIAL_REQUIREMENT_REPOSITORY)
    private readonly materialRequirementRepository: MaterialRequirementRepository,
  ) {}

  async create(
    dto: CreateMaterialRequirementDto,
  ): Promise<MaterialRequirement> {
    const requirement = MaterialRequirement.create({
      planningRunId: dto.planningRunId,
      componentId: dto.componentId,
      requiredQuantity: dto.requiredQuantity,
      availableQuantity: dto.availableQuantity,
      reservedQuantity: dto.reservedQuantity,
      requiredDate: new Date(dto.requiredDate),
      source: dto.source,
      sourceReferenceId: dto.sourceReferenceId,
    });
    await this.materialRequirementRepository.save(requirement);
    return requirement;
  }

  async findAll(
    planningRunId?: string,
    componentId?: string,
    source?: RequirementSource,
    onlyShortages?: boolean,
  ): Promise<MaterialRequirement[]> {
    return this.materialRequirementRepository.findMany({
      planningRunId,
      componentId,
      source,
      onlyShortages,
    });
  }

  async findOne(id: string): Promise<MaterialRequirement> {
    const req = await this.materialRequirementRepository.findById(id);
    if (!req) {
      throw new NotFoundException(
        `Material Requirement with ID ${id} not found.`,
      );
    }
    return req;
  }
}
