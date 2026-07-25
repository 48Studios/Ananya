import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BankReconciliationsService } from './bank-reconciliations.service';
import {
  CreateBankReconciliationDto,
  AddBankTransactionDto,
  MatchTransactionDto,
} from './dtos';
import { ReconciliationStatus } from '@ananya/finance';

@Controller('bank-reconciliations')
export class BankReconciliationsController {
  constructor(private readonly reconService: BankReconciliationsService) {}

  @Post()
  create(@Body() dto: CreateBankReconciliationDto) {
    return this.reconService.create(dto);
  }

  @Get()
  findAll(
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: ReconciliationStatus,
  ) {
    return this.reconService.findAll(bankAccountId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reconService.findOne(id);
  }

  @Post(':id/transactions')
  addTransaction(@Param('id') id: string, @Body() dto: AddBankTransactionDto) {
    return this.reconService.addTransaction(id, dto);
  }

  @Post(':id/match')
  matchTransaction(@Param('id') id: string, @Body() dto: MatchTransactionDto) {
    return this.reconService.matchTransaction(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.reconService.complete(id);
  }
}
