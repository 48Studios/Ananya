import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dtos';
import { AccountType } from '@ananya/finance';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Get()
  findAll(
    @Query('accountType') accountType?: AccountType,
    @Query('isActive') isActive?: boolean,
    @Query('search') search?: string,
  ) {
    return this.accountsService.findAll(accountType, isActive, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.accountsService.activate(id);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.accountsService.deactivate(id);
  }
}
