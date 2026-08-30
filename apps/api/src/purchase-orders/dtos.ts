import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddPoLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsOptional()
  vendorPartNumber?: string;

  @IsNumber()
  @IsNotEmpty()
  unitPrice!: number;

  @IsNumber()
  @IsNotEmpty()
  quantityOrdered!: number;

  @IsNumber()
  @IsOptional()
  taxRate?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsString()
  @IsOptional()
  carrier?: string;

  @IsString()
  @IsOptional()
  shippingProvider?: string;

  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddPoLineDto)
  lines?: AddPoLineDto[];
}

export class UpdatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsString()
  @IsOptional()
  carrier?: string;

  @IsString()
  @IsOptional()
  shippingProvider?: string;

  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddPoLineDto)
  lines?: AddPoLineDto[];
}
