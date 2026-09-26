import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class CreatePurchaseInvoiceDto {
  @IsString()
  @IsNotEmpty()
  vendorInvoiceNumber!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @IsString()
  @IsOptional()
  goodsReceiptId?: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsOptional()
  lines?: AddPurchaseInvoiceLineDto[];
}

export class AddPurchaseInvoiceLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @IsNotEmpty()
  quantityBilled!: number;

  @IsNumber()
  @IsNotEmpty()
  unitPrice!: number;
}

export class UpdatePurchaseInvoiceStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}
