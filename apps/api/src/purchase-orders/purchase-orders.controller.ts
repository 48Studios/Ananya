import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  AddPoLineDto,
} from './dtos';
import { PurchaseOrderStatus } from '@ananya/procurement';
import { PoExceptionFilter } from './po-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('purchase-orders')
@UseFilters(PoExceptionFilter)
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Post()
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Create', 'create purchase order'),
  )
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.poService.create(dto);
  }

  @Get()
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Read', 'view purchase orders'),
  )
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: PurchaseOrderStatus,
    @Query('search') search?: string,
  ) {
    return this.poService.findAll(supplierId, status, search);
  }

  @Get(':id')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Read', 'view purchase order by id'),
  )
  findOne(@Param('id') id: string) {
    return this.poService.findOne(id);
  }

  @Put(':id')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Update', 'update purchase order'),
  )
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.poService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Update', 'delete purchase order'),
  )
  delete(@Param('id') id: string) {
    return this.poService.delete(id);
  }

  @Post(':id/lines')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Update', 'add purchase order line'),
  )
  addLine(@Param('id') id: string, @Body() dto: AddPoLineDto) {
    return this.poService.addLine(id, dto);
  }

  @Post(':id/submit')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Update', 'submit purchase order'),
  )
  submit(@Param('id') id: string) {
    return this.poService.submit(id);
  }

  @Post(':id/approve')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Approve', 'approve purchase order'),
  )
  approve(@Param('id') id: string) {
    return this.poService.approve(id);
  }

  @Post(':id/issue')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Approve', 'issue purchase order'),
  )
  issue(@Param('id') id: string) {
    return this.poService.issue(id);
  }

  @Post(':id/cancel')
  @UseGuards(
    createPermissionGuard('PurchaseOrders.Update', 'cancel purchase order'),
  )
  cancel(@Param('id') id: string) {
    return this.poService.cancel(id);
  }
}
