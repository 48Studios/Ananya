import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { WarehouseTransfersService } from './warehouse-transfers.service';
import { CreateWarehouseTransferDto, AddTransferLineDto } from './dtos';
import { TransferStatus } from '@ananya/warehouse';

@Controller('warehouse-transfers')
export class WarehouseTransfersController {
  constructor(private readonly transfersService: WarehouseTransfersService) {}

  @Post()
  create(@Body() dto: CreateWarehouseTransferDto) {
    return this.transfersService.create(dto);
  }

  @Get()
  findAll(
    @Query('sourceBinId') sourceBinId?: string,
    @Query('destinationBinId') destinationBinId?: string,
    @Query('status') status?: TransferStatus,
  ) {
    return this.transfersService.findAll(sourceBinId, destinationBinId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddTransferLineDto) {
    return this.transfersService.addLine(id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.transfersService.approve(id);
  }

  @Post(':id/dispatch')
  dispatch(@Param('id') id: string) {
    return this.transfersService.dispatch(id);
  }

  @Post(':id/complete')
  completeTransfer(@Param('id') id: string) {
    return this.transfersService.completeTransfer(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.transfersService.cancel(id);
  }
}
