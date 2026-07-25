import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  MaterialConsumption,
  MaterialConsumptionRepository,
  ManufacturingTraceability,
  ManufacturingTraceabilityRepository,
} from '@ananya/manufacturing';
import { CreateMaterialConsumptionDto, AddConsumptionLineDto } from './dtos';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const MATERIAL_CONSUMPTION_REPOSITORY =
  'MATERIAL_CONSUMPTION_REPOSITORY';
export const TRACEABILITY_REPOSITORY_FOR_CONSUMPTION =
  'TRACEABILITY_REPOSITORY_FOR_CONSUMPTION';

@Injectable()
export class MaterialConsumptionsService {
  constructor(
    @Inject(MATERIAL_CONSUMPTION_REPOSITORY)
    private readonly consumptionRepository: MaterialConsumptionRepository,
    @Inject(TRACEABILITY_REPOSITORY_FOR_CONSUMPTION)
    private readonly traceabilityRepository: ManufacturingTraceabilityRepository,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(
    dto: CreateMaterialConsumptionDto,
  ): Promise<MaterialConsumption> {
    const consumptionNumber =
      await this.consumptionRepository.generateNextConsumptionNumber();
    const consumption = MaterialConsumption.create({
      consumptionNumber,
      productionOrderId: dto.productionOrderId,
    });
    await this.consumptionRepository.save(consumption);
    return consumption;
  }

  async findAll(productionOrderId?: string): Promise<MaterialConsumption[]> {
    return this.consumptionRepository.findMany({ productionOrderId });
  }

  async findOne(id: string): Promise<MaterialConsumption> {
    const consumption = await this.consumptionRepository.findById(id);
    if (!consumption) {
      throw new NotFoundException(
        `Material Consumption with ID ${id} not found.`,
      );
    }
    return consumption;
  }

  async addLine(
    consumptionId: string,
    dto: AddConsumptionLineDto,
  ): Promise<MaterialConsumption> {
    const consumption = await this.findOne(consumptionId);
    consumption.addLine(dto);
    await this.consumptionRepository.save(consumption);
    return consumption;
  }

  async post(id: string): Promise<MaterialConsumption> {
    const consumption = await this.findOne(id);
    if (consumption.status !== 'DRAFT') {
      throw new BadRequestException(
        'Material Consumption has already been posted.',
      );
    }

    // Issue inventory for each consumption line
    for (const line of consumption.lines) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Issue',
        componentId: line.componentId,
        sourceLocationId: line.locationId,
        quantity: line.quantityConsumed,
        unitOfMeasure: 'pcs',
        reference: consumption.consumptionNumber,
        reason: 'Material consumption for production order',
        createdBy: 'SYSTEM',
      });

      // Record traceability
      const trace = ManufacturingTraceability.create({
        eventType: 'MATERIAL_CONSUMED',
        productionOrderId: consumption.productionOrderId,
        consumptionId: consumption.id,
        componentId: line.componentId,
        locationId: line.locationId,
        quantity: line.quantityConsumed,
        batchNumber: line.batchNumber,
        serialNumbers: line.serialNumbers,
      });
      await this.traceabilityRepository.save(trace);
    }

    // Mark posted
    consumption.post();
    await this.consumptionRepository.save(consumption);

    // Rebuild projections
    await this.inventoryProjectionsService.rebuild();

    return consumption;
  }
}
