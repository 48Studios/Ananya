import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { CreateGoodsReceiptDto, AddGoodsReceiptLineDto } from './dtos';
import { GrExceptionFilter } from './gr-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('goods-receipts')
@UseFilters(GrExceptionFilter)
export class GoodsReceiptsController {
  constructor(private readonly grService: GoodsReceiptsService) {}

  @Post()
  @UseGuards(createPermissionGuard('GoodsReceipts.Receive'))
  create(@Body() dto: CreateGoodsReceiptDto) {
    return this.grService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findAll(
    @Query('purchaseOrderId') purchaseOrderId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.grService.findAll(purchaseOrderId, supplierId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findOne(@Param('id') id: string) {
    return this.grService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('GoodsReceipts.Receive'))
  addLine(@Param('id') id: string, @Body() dto: AddGoodsReceiptLineDto) {
    return this.grService.addLine(id, dto);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('GoodsReceipts.Receive'))
  postReceipt(@Param('id') id: string) {
    return this.grService.postReceipt(id);
  }
}
