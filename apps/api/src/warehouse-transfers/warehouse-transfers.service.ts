import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  WarehouseTransfer,
  WarehouseTransferRepository,
  TransferStatus,
} from '@ananya/warehouse';
import { CreateWarehouseTransferDto, AddTransferLineDto } from './dtos';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const WAREHOUSE_TRANSFER_REPOSITORY = 'WAREHOUSE_TRANSFER_REPOSITORY';

@Injectable()
export class WarehouseTransfersService {
  constructor(
    @Inject(WAREHOUSE_TRANSFER_REPOSITORY)
    private readonly transferRepository: WarehouseTransferRepository,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateWarehouseTransferDto): Promise<WarehouseTransfer> {
    const transferNumber =
      await this.transferRepository.generateNextTransferNumber();
    const transfer = WarehouseTransfer.create({
      transferNumber,
      sourceBinId: dto.sourceBinId,
      destinationBinId: dto.destinationBinId,
    });
    await this.transferRepository.save(transfer);
    return transfer;
  }

  async findAll(
    sourceBinId?: string,
    destinationBinId?: string,
    status?: TransferStatus,
  ): Promise<WarehouseTransfer[]> {
    return this.transferRepository.findMany({
      sourceBinId,
      destinationBinId,
      status,
    });
  }

  async findOne(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.transferRepository.findById(id);
    if (!transfer) {
      throw new NotFoundException(
        `Warehouse Transfer with ID ${id} not found.`,
      );
    }
    return transfer;
  }

  async addLine(
    id: string,
    dto: AddTransferLineDto,
  ): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    transfer.addLine(dto);
    await this.transferRepository.save(transfer);
    return transfer;
  }

  async approve(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    transfer.approve();
    await this.transferRepository.save(transfer);
    return transfer;
  }

  async dispatch(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    transfer.dispatch();
    await this.transferRepository.save(transfer);
    return transfer;
  }

  async completeTransfer(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'APPROVED' && transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(
        'Warehouse Transfer must be APPROVED or IN_TRANSIT before completion.',
      );
    }

    // Execute Inventory Transfer Transactions for each line item
    for (const line of transfer.lines) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Transfer',
        componentId: line.componentId,
        sourceLocationId: transfer.sourceBinId,
        destinationLocationId: transfer.destinationBinId,
        quantity: line.quantity,
        unitOfMeasure: 'pcs',
        reference: transfer.transferNumber,
        reason: 'Internal bin-to-bin warehouse transfer',
        createdBy: 'SYSTEM',
      });
    }

    // Mark transfer completed
    transfer.complete();
    await this.transferRepository.save(transfer);

    // Rebuild projections
    await this.inventoryProjectionsService.rebuild();

    return transfer;
  }

  async cancel(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    transfer.cancel();
    await this.transferRepository.save(transfer);
    return transfer;
  }
}
