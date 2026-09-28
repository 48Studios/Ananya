import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FinishedGoodsService } from './finished-goods.service';
import { CreateFinishedGoodsDto, AddFgrLineDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('finished-goods')
export class FinishedGoodsController {
  constructor(private readonly finishedGoodsService: FinishedGoodsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  create(@Body() dto: CreateFinishedGoodsDto) {
    return this.finishedGoodsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  findAll(@Query('productionOrderId') productionOrderId?: string) {
    return this.finishedGoodsService.findAll(productionOrderId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  findOne(@Param('id') id: string) {
    return this.finishedGoodsService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  addLine(@Param('id') id: string, @Body() dto: AddFgrLineDto) {
    return this.finishedGoodsService.addLine(id, dto);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  post(@Param('id') id: string) {
    return this.finishedGoodsService.post(id);
  }
}
