import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { FinishedGoodsService } from './finished-goods.service';
import { CreateFinishedGoodsDto, AddFgrLineDto } from './dtos';

@Controller('finished-goods')
export class FinishedGoodsController {
  constructor(private readonly finishedGoodsService: FinishedGoodsService) {}

  @Post()
  create(@Body() dto: CreateFinishedGoodsDto) {
    return this.finishedGoodsService.create(dto);
  }

  @Get()
  findAll(@Query('productionOrderId') productionOrderId?: string) {
    return this.finishedGoodsService.findAll(productionOrderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.finishedGoodsService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddFgrLineDto) {
    return this.finishedGoodsService.addLine(id, dto);
  }

  @Post(':id/post')
  post(@Param('id') id: string) {
    return this.finishedGoodsService.post(id);
  }
}
