import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateSalesOrderDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @IsDateString()
  @IsOptional()
  requiredDate?: string;

  @IsString()
  @IsOptional()
  quotationId?: string;
}

export class ConvertQuotationDto {
  @IsString()
  @IsNotEmpty()
  quotationId!: string;

  @IsDateString()
  @IsOptional()
  requiredDate?: string;
}

export class AddSalesOrderLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  tax?: number;
}
