import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Warehouse,
  WarehouseRepository,
  WarehouseBinProps,
} from '@ananya/warehouse';
import { CreateWarehouseDto, AddBinDto, UpdateBinDto } from './dtos';

export const WAREHOUSE_REPOSITORY = 'WAREHOUSE_REPOSITORY';

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY)
    private readonly warehouseRepository: WarehouseRepository,
  ) {}

  async create(dto: CreateWarehouseDto): Promise<Warehouse> {
    const warehouse = Warehouse.create(dto);
    await this.warehouseRepository.save(warehouse);
    return warehouse;
  }

  async findAll(): Promise<Warehouse[]> {
    return this.warehouseRepository.findMany();
  }

  async findOne(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found.`);
    }
    return warehouse;
  }

  async addBin(
    warehouseId: string,
    dto: AddBinDto,
  ): Promise<WarehouseBinProps> {
    const warehouse = await this.findOne(warehouseId);
    const bin = warehouse.addBin(dto);
    await this.warehouseRepository.save(warehouse);
    return bin;
  }

  async updateBin(
    warehouseId: string,
    binId: string,
    dto: UpdateBinDto,
  ): Promise<Warehouse> {
    const warehouse = await this.findOne(warehouseId);
    if (dto.isActive !== undefined) {
      warehouse.toggleBinState(binId, dto.isActive);
    }
    if (dto.capacity !== undefined) {
      warehouse.updateBinCapacity(binId, dto.capacity);
    }
    await this.warehouseRepository.save(warehouse);
    return warehouse;
  }
}
