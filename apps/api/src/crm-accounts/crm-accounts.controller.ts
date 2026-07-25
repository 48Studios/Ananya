import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CrmAccountsService } from './crm-accounts.service';
import { CreateCrmAccountDto, AddContactDto } from './dtos';

@Controller('crm-accounts')
export class CrmAccountsController {
  constructor(private readonly crmAccountsService: CrmAccountsService) {}

  @Post()
  create(@Body() dto: CreateCrmAccountDto) {
    return this.crmAccountsService.create(dto);
  }

  @Get()
  findAll(
    @Query('isArchived') isArchived?: boolean,
    @Query('search') search?: string,
  ) {
    return this.crmAccountsService.findAll(isArchived, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.crmAccountsService.findOne(id);
  }

  @Post(':id/contacts')
  addContact(@Param('id') id: string, @Body() dto: AddContactDto) {
    return this.crmAccountsService.addContact(id, dto);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.crmAccountsService.archive(id);
  }
}
