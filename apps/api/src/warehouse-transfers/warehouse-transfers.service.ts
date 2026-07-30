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
import {
  CreateWarehouseTransferDto,
  UpdateWarehouseTransferDto,
  AddTransferLineDto,
} from './dtos';
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
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new BadRequestException(
        'Source location and destination location cannot be identical.',
      );
    }

    const transferNumber =
      await this.transferRepository.generateNextTransferNumber();

    const transfer = WarehouseTransfer.create({
      transferNumber,
      sourceLocationId: dto.sourceLocationId,
      destinationLocationId: dto.destinationLocationId,
      requestedDate: dto.requestedDate ? new Date(dto.requestedDate) : null,
      requestedBy: dto.requestedBy || 'SYSTEM',
      notes: dto.notes,
      lines: dto.lines,
    });

    await this.transferRepository.save(transfer);
    return transfer;
  }

  async update(
    id: string,
    dto: UpdateWarehouseTransferDto,
  ): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot edit Warehouse Transfer in ${transfer.status} status.`,
      );
    }

    if (
      dto.sourceLocationId &&
      dto.destinationLocationId &&
      dto.sourceLocationId === dto.destinationLocationId
    ) {
      throw new BadRequestException(
        'Source location and destination location cannot be identical.',
      );
    }

    transfer.updateHeader({
      sourceLocationId: dto.sourceLocationId,
      destinationLocationId: dto.destinationLocationId,
      requestedDate: dto.requestedDate ? new Date(dto.requestedDate) : null,
      notes: dto.notes,
    });

    if (dto.lines) {
      transfer.lines = [];
      for (const line of dto.lines) {
        transfer.addLine(line);
      }
    }

    await this.transferRepository.save(transfer);
    return transfer;
  }

  async findAll(
    sourceLocationId?: string,
    destinationLocationId?: string,
    status?: TransferStatus,
    search?: string,
  ): Promise<WarehouseTransfer[]> {
    return this.transferRepository.findMany({
      sourceLocationId,
      destinationLocationId,
      status,
      search,
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

  async submit(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);
    transfer.submit();
    await this.transferRepository.save(transfer);
    return transfer;
  }

  async dispatch(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);

    if (transfer.status !== 'SUBMITTED' && transfer.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot dispatch transfer in ${transfer.status} status.`,
      );
    }

    if (transfer.lines.length === 0) {
      throw new BadRequestException(
        'Warehouse Transfer must contain at least one line item before dispatching.',
      );
    }

    // Post outbound inventory ledger transactions (TransferOut / Issue)
    for (const line of transfer.lines) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Issue',
        componentId: line.componentId,
        sourceLocationId: transfer.sourceLocationId,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure || 'pcs',
        reference: transfer.transferNumber,
        reason: `Outbound transfer dispatch to destination location (${transfer.transferNumber})`,
        createdBy: 'SYSTEM',
      });
    }

    transfer.dispatch();
    await this.transferRepository.save(transfer);

    await this.inventoryProjectionsService.rebuild();
    return transfer;
  }

  async receive(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);

    if (transfer.status !== 'DISPATCHED' && transfer.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot receive transfer in ${transfer.status} status.`,
      );
    }

    // Post inbound inventory ledger transactions (TransferIn / Receipt)
    for (const line of transfer.lines) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Receipt',
        componentId: line.componentId,
        destinationLocationId: transfer.destinationLocationId,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure || 'pcs',
        reference: transfer.transferNumber,
        reason: `Inbound transfer receipt from source location (${transfer.transferNumber})`,
        createdBy: 'SYSTEM',
      });
    }

    transfer.receive();
    await this.transferRepository.save(transfer);

    await this.inventoryProjectionsService.rebuild();
    return transfer;
  }

  async cancel(id: string): Promise<WarehouseTransfer> {
    const transfer = await this.findOne(id);

    if (transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot cancel transfer in ${transfer.status} status.`,
      );
    }

    // If already dispatched, create compensating receipt back to source location
    if (transfer.status === 'DISPATCHED') {
      for (const line of transfer.lines) {
        await this.inventoryTransactionsService.create({
          transactionType: 'Receipt',
          componentId: line.componentId,
          destinationLocationId: transfer.sourceLocationId,
          quantity: line.quantity,
          unitOfMeasure: line.unitOfMeasure || 'pcs',
          reference: transfer.transferNumber,
          reason: `Compensating return for cancelled transfer (${transfer.transferNumber})`,
          createdBy: 'SYSTEM',
        });
      }
      await this.inventoryProjectionsService.rebuild();
    }

    transfer.cancel();
    await this.transferRepository.save(transfer);
    return transfer;
  }

  async delete(id: string): Promise<void> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT Warehouse Transfers can be deleted.',
      );
    }
    await this.transferRepository.delete(id);
  }
}
