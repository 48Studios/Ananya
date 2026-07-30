import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddGoodsReceiptLineDto {
  @IsString()
  @IsNotEmpty()
  poLineId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsNumber()
  @IsNotEmpty()
  quantityReceived!: number;

  @IsNumber()
  @IsOptional()
  quantityRejected?: number;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];
}

export class CreateGoodsReceiptDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsOptional()
  packingSlipNumber?: string;

  @IsDateString()
  @IsOptional()
  receivedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddGoodsReceiptLineDto)
  lines?: AddGoodsReceiptLineDto[];
}
