import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BankReconciliationsService } from './bank-reconciliations.service';
import {
  CreateBankReconciliationDto,
  AddBankTransactionDto,
  MatchTransactionDto,
} from './dtos';
import { ReconciliationStatus } from '@ananya/finance';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('bank-reconciliations')
export class BankReconciliationsController {
  constructor(private readonly reconService: BankReconciliationsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Accounting.Create'))
  create(@Body() dto: CreateBankReconciliationDto) {
    return this.reconService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll(
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: ReconciliationStatus,
  ) {
    return this.reconService.findAll(bankAccountId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findOne(@Param('id') id: string) {
    return this.reconService.findOne(id);
  }

  @Post(':id/transactions')
  @UseGuards(createPermissionGuard('Accounting.Update'))
  addTransaction(@Param('id') id: string, @Body() dto: AddBankTransactionDto) {
    return this.reconService.addTransaction(id, dto);
  }

  @Post(':id/match')
  @UseGuards(createPermissionGuard('Accounting.Update'))
  matchTransaction(@Param('id') id: string, @Body() dto: MatchTransactionDto) {
    return this.reconService.matchTransaction(id, dto);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  complete(@Param('id') id: string) {
    return this.reconService.complete(id);
  }
}
