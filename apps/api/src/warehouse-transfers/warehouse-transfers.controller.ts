import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { WarehouseTransfersService } from './warehouse-transfers.service';
import {
  CreateWarehouseTransferDto,
  UpdateWarehouseTransferDto,
  AddTransferLineDto,
} from './dtos';
import { WarehouseTransferExceptionFilter } from './warehouse-transfer-exception.filter';
import type { TransferStatus } from '@ananya/warehouse';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller(['warehouse-transfers', 'transfers'])
@UseFilters(WarehouseTransferExceptionFilter)
export class WarehouseTransfersController {
  constructor(private readonly transfersService: WarehouseTransfersService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  create(@Body() dto: CreateWarehouseTransferDto) {
    return this.transfersService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findAll(
    @Query('sourceLocationId') sourceLocationId?: string,
    @Query('destinationLocationId') destinationLocationId?: string,
    @Query('status') status?: TransferStatus,
    @Query('search') search?: string,
  ) {
    return this.transfersService.findAll(
      sourceLocationId,
      destinationLocationId,
      status,
      search,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseTransferDto) {
    return this.transfersService.update(id, dto);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  addLine(@Param('id') id: string, @Body() dto: AddTransferLineDto) {
    return this.transfersService.addLine(id, dto);
  }

  @Post(':id/submit')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  submit(@Param('id') id: string) {
    return this.transfersService.submit(id);
  }

  @Post(':id/dispatch')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  dispatch(@Param('id') id: string) {
    return this.transfersService.dispatch(id);
  }

  @Post(':id/receive')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  receive(@Param('id') id: string) {
    return this.transfersService.receive(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  cancel(@Param('id') id: string) {
    return this.transfersService.cancel(id);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('Inventory.Transfer'))
  delete(@Param('id') id: string) {
    return this.transfersService.delete(id);
  }
}
