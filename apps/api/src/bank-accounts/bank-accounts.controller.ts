import { Controller, Get, UseGuards } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll() {
    return this.bankAccountsService.findAll();
  }
}
