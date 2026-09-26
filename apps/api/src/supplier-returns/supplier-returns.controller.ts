import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { SupplierReturnsService } from './supplier-returns.service';
import {
  CreateSupplierReturnDto,
  UpdateSupplierReturnDto,
  UpdateSupplierReturnStatusDto,
  AddSupplierReturnLineDto,
} from './dtos';

@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(private readonly returnsService: SupplierReturnsService) {}

  @Post()
  create(@Body() dto: CreateSupplierReturnDto) {
    return this.returnsService.create(dto);
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    return this.returnsService.findAll(supplierId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierReturnDto) {
    return this.returnsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.returnsService.delete(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierReturnStatusDto,
  ) {
    return this.returnsService.updateStatus(id, dto);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddSupplierReturnLineDto) {
    return this.returnsService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.returnsService.removeLine(id, lineId);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body('rmaNumber') rmaNumber?: string) {
    return this.returnsService.approve(id, rmaNumber);
  }

  @Post(':id/dispatch')
  dispatch(@Param('id') id: string) {
    return this.returnsService.dispatch(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.returnsService.complete(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.returnsService.cancel(id);
  }
}
