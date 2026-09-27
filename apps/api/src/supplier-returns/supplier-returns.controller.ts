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
  UseGuards,
} from '@nestjs/common';
import { SupplierReturnsService } from './supplier-returns.service';
import {
  CreateSupplierReturnDto,
  UpdateSupplierReturnDto,
  UpdateSupplierReturnStatusDto,
  AddSupplierReturnLineDto,
} from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(private readonly returnsService: SupplierReturnsService) {}

  @Post()
  @UseGuards(createPermissionGuard('PurchaseOrders.Create'))
  create(@Body() dto: CreateSupplierReturnDto) {
    return this.returnsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    return this.returnsService.findAll(supplierId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  update(@Param('id') id: string, @Body() dto: UpdateSupplierReturnDto) {
    return this.returnsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  delete(@Param('id') id: string) {
    return this.returnsService.delete(id);
  }

  @Patch(':id/status')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierReturnStatusDto,
  ) {
    return this.returnsService.updateStatus(id, dto);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  addLine(@Param('id') id: string, @Body() dto: AddSupplierReturnLineDto) {
    return this.returnsService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.returnsService.removeLine(id, lineId);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  approve(@Param('id') id: string, @Body('rmaNumber') rmaNumber?: string) {
    return this.returnsService.approve(id, rmaNumber);
  }

  @Post(':id/dispatch')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  dispatch(@Param('id') id: string) {
    return this.returnsService.dispatch(id);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  complete(@Param('id') id: string) {
    return this.returnsService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  cancel(@Param('id') id: string) {
    return this.returnsService.cancel(id);
  }
}
