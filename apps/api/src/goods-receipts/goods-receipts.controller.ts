import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { CreateGoodsReceiptDto, AddGoodsReceiptLineDto } from './dtos';
import { GrExceptionFilter } from './gr-exception.filter';

@Controller('goods-receipts')
@UseFilters(GrExceptionFilter)
export class GoodsReceiptsController {
  constructor(private readonly grService: GoodsReceiptsService) {}

  @Post()
  create(@Body() dto: CreateGoodsReceiptDto) {
    return this.grService.create(dto);
  }

  @Get()
  findAll(
    @Query('purchaseOrderId') purchaseOrderId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.grService.findAll(purchaseOrderId, supplierId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.grService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddGoodsReceiptLineDto) {
    return this.grService.addLine(id, dto);
  }

  @Post(':id/post')
  postReceipt(@Param('id') id: string) {
    return this.grService.postReceipt(id);
  }
}
