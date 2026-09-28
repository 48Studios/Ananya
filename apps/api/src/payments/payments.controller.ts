import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dtos';
import { PaymentType, PaymentStatus } from '@ananya/finance';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Accounting.Create'))
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll(
    @Query('paymentType') paymentType?: PaymentType,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.paymentsService.findAll(paymentType, bankAccountId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  post(
    @Param('id') id: string,
    @Body('targetInvoiceId') targetInvoiceId?: string,
  ) {
    return this.paymentsService.post(id, targetInvoiceId);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  cancel(@Param('id') id: string) {
    return this.paymentsService.cancel(id);
  }
}
