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
import { SuppliersService } from './suppliers.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  AddContactDto,
  MapComponentDto,
} from './dtos';
import { SupplierExceptionFilter } from './supplier-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('suppliers')
@UseFilters(SupplierExceptionFilter)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @UseGuards(createPermissionGuard('PurchaseOrders.Create', 'create supplier'))
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('PurchaseOrders.Read', 'view suppliers'))
  findAll(@Query('search') search?: string) {
    return this.suppliersService.findAll(search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Read', 'view supplier by id'))
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update', 'update supplier'))
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('PurchaseOrders.Update', 'delete supplier'))
  delete(@Param('id') id: string) {
    return this.suppliersService.delete(id);
  }

  @Post(':id/contacts')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update', 'add supplier contact'))
  addContact(@Param('id') supplierId: string, @Body() dto: AddContactDto) {
    return this.suppliersService.addContact(supplierId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('PurchaseOrders.Update', 'remove supplier contact'))
  removeContact(
    @Param('id') supplierId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.suppliersService.removeContact(supplierId, contactId);
  }

  @Post(':id/components')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update', 'map supplier component'))
  mapComponent(@Param('id') supplierId: string, @Body() dto: MapComponentDto) {
    return this.suppliersService.mapComponent(supplierId, dto);
  }

  @Delete(':id/components/:mappingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('PurchaseOrders.Update', 'remove supplier component mapping'))
  removeComponentMapping(
    @Param('id') supplierId: string,
    @Param('mappingId') mappingId: string,
  ) {
    return this.suppliersService.removeComponentMapping(supplierId, mappingId);
  }
}
