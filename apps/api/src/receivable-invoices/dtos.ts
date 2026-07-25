import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateReceivableInvoiceDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  salesOrderId!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
