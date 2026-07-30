import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CreateInventoryTransactionDto } from './create-inventory-transaction.dto';
import { InventoryTransactionsService } from './inventory-transactions.service';
import type { TransactionType } from '@ananya/inventory';

@Controller('inventory-transactions')
export class InventoryTransactionsController {
  constructor(private readonly service: InventoryTransactionsService) {}

  @Post()
  async create(@Body() dto: CreateInventoryTransactionDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query('componentId') componentId?: string,
    @Query('locationId') locationId?: string,
    @Query('transactionType') transactionType?: TransactionType,
    @Query('reference') reference?: string,
    @Query('createdBy') createdBy?: string,
    @Query('search') search?: string,
  ) {
    return this.service.getAll({
      componentId,
      locationId,
      transactionType,
      reference,
      createdBy,
      search,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const tx = await this.service.getById(id);
    if (!tx) {
      throw new NotFoundException(
        `Inventory transaction with ID ${id} not found`,
      );
    }
    return tx;
  }
}
