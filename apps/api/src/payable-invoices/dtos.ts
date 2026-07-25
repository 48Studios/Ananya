import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreatePayableInvoiceDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  purchaseInvoiceId!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
