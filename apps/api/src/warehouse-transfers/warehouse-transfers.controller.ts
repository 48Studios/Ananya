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
} from '@nestjs/common';
import { WarehouseTransfersService } from './warehouse-transfers.service';
import {
  CreateWarehouseTransferDto,
  UpdateWarehouseTransferDto,
  AddTransferLineDto,
} from './dtos';
import { WarehouseTransferExceptionFilter } from './warehouse-transfer-exception.filter';
import type { TransferStatus } from '@ananya/warehouse';

@Controller(['warehouse-transfers', 'transfers'])
@UseFilters(WarehouseTransferExceptionFilter)
export class WarehouseTransfersController {
  constructor(private readonly transfersService: WarehouseTransfersService) {}

  @Post()
  create(@Body() dto: CreateWarehouseTransferDto) {
    return this.transfersService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseTransferDto) {
    return this.transfersService.update(id, dto);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddTransferLineDto) {
    return this.transfersService.addLine(id, dto);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string) {
    return this.transfersService.submit(id);
  }

  @Post(':id/dispatch')
  dispatch(@Param('id') id: string) {
    return this.transfersService.dispatch(id);
  }

  @Post(':id/receive')
  receive(@Param('id') id: string) {
    return this.transfersService.receive(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.transfersService.cancel(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.transfersService.delete(id);
  }
}
