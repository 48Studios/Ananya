import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { PaymentType, PaymentMethod } from '@ananya/finance';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  paymentType!: PaymentType;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  bankAccountId?: string;

  @IsString()
  @IsOptional()
  targetInvoiceId?: string;
}
