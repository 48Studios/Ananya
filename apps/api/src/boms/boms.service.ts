import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  BillOfMaterials,
  BillOfMaterialsRepository,
  BomStatus,
  ActiveBomAlreadyExistsError,
} from '@ananya/manufacturing';
import {
  CreateBomDto,
  UpdateBomDto,
  AddBomLineDto,
  DuplicateBomDto,
} from './dtos';

export const BOM_REPOSITORY = 'BOM_REPOSITORY';

@Injectable()
export class BomsService {
  constructor(
    @Inject(BOM_REPOSITORY)
    private readonly bomRepository: BillOfMaterialsRepository,
  ) {}

  async create(dto: CreateBomDto): Promise<BillOfMaterials> {
    const bom = BillOfMaterials.create({
      componentId: dto.componentId,
      revision: dto.revision,
      notes: dto.notes,
    });

    if (dto.lines && dto.lines.length > 0) {
      for (const line of dto.lines) {
        bom.addLine(line);
      }
    }

    await this.bomRepository.save(bom);
    return bom;
  }

  async update(id: string, dto: UpdateBomDto): Promise<BillOfMaterials> {
    const bom = await this.findOne(id);
    if (bom.status !== 'DRAFT') {
      throw new BadRequestException(
        'Released or Obsolete BOM cannot be updated.',
      );
    }

    bom.updateHeader(dto.notes);

    if (dto.lines) {
      bom.clearLines();
      for (const line of dto.lines) {
        bom.addLine(line);
      }
    }

    await this.bomRepository.save(bom);
    return bom;
  }

  async duplicate(id: string, dto?: DuplicateBomDto): Promise<BillOfMaterials> {
    const sourceBom = await this.findOne(id);
    const newBom = sourceBom.duplicate(dto?.newRevision);

    await this.bomRepository.save(newBom);
    return newBom;
  }

  async findAll(
    componentId?: string,
    status?: BomStatus,
  ): Promise<BillOfMaterials[]> {
    return this.bomRepository.findMany({ componentId, status });
  }

  async findRevisions(componentId: string): Promise<BillOfMaterials[]> {
    return this.bomRepository.findRevisionsByComponentId(componentId);
  }

  async findOne(id: string): Promise<BillOfMaterials> {
    const bom = await this.bomRepository.findById(id);
    if (!bom) {
      throw new NotFoundException(`BOM with ID ${id} not found.`);
    }
    return bom;
  }

  async addLine(bomId: string, dto: AddBomLineDto): Promise<BillOfMaterials> {
    const bom = await this.findOne(bomId);
    bom.addLine(dto);
    await this.bomRepository.save(bom);
    return bom;
  }

  async removeLine(bomId: string, lineId: string): Promise<BillOfMaterials> {
    const bom = await this.findOne(bomId);
    bom.removeLine(lineId);
    await this.bomRepository.save(bom);
    return bom;
  }

  async release(id: string): Promise<BillOfMaterials> {
    const bom = await this.findOne(id);

    // Check if an active RELEASED revision already exists for this finished product
    const activeExisting = await this.bomRepository.findActiveByComponentId(
      bom.componentId,
    );
    if (activeExisting && activeExisting.id !== bom.id) {
      throw new ActiveBomAlreadyExistsError(
        bom.componentId,
        activeExisting.revision,
      );
    }

    bom.release();
    await this.bomRepository.save(bom);
    return bom;
  }

  async obsolete(id: string): Promise<BillOfMaterials> {
    const bom = await this.findOne(id);
    bom.obsolete();
    await this.bomRepository.save(bom);
    return bom;
  }

  async delete(id: string): Promise<void> {
    const bom = await this.findOne(id);
    if (bom.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT BOMs can be deleted.');
    }
    await this.bomRepository.delete(id);
  }
}
