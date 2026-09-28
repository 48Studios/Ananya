import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CrmAccountsService } from './crm-accounts.service';
import { CreateCrmAccountDto, AddContactDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('crm-accounts')
export class CrmAccountsController {
  constructor(private readonly crmAccountsService: CrmAccountsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateCrmAccountDto) {
    return this.crmAccountsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('isArchived') isArchived?: boolean,
    @Query('search') search?: string,
  ) {
    return this.crmAccountsService.findAll(isArchived, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.crmAccountsService.findOne(id);
  }

  @Post(':id/contacts')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addContact(@Param('id') id: string, @Body() dto: AddContactDto) {
    return this.crmAccountsService.addContact(id, dto);
  }

  @Post(':id/archive')
  @UseGuards(createPermissionGuard('Sales.Update'))
  archive(@Param('id') id: string) {
    return this.crmAccountsService.archive(id);
  }
}
