import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  BillOfMaterials,
  BillOfMaterialsRepository,
  BomStatus,
} from '@ananya/manufacturing';
import { CreateBomDto, AddBomLineDto } from './dtos';

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
    await this.bomRepository.save(bom);
    return bom;
  }

  async findAll(
    componentId?: string,
    status?: BomStatus,
  ): Promise<BillOfMaterials[]> {
    return this.bomRepository.findMany({ componentId, status });
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
}
