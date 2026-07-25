import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dtos';
import { PaymentType, PaymentStatus } from '@ananya/finance';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Get()
  findAll(
    @Query('paymentType') paymentType?: PaymentType,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.paymentsService.findAll(paymentType, bankAccountId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post(':id/post')
  post(
    @Param('id') id: string,
    @Body('targetInvoiceId') targetInvoiceId?: string,
  ) {
    return this.paymentsService.post(id, targetInvoiceId);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.paymentsService.cancel(id);
  }
}
