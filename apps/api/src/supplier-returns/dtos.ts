import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
} from 'class-validator';

export class CreateSupplierReturnDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsOptional()
  purchaseOrderId?: string;

  @IsString()
  @IsOptional()
  rmaNumber?: string;
}

export class UpdateSupplierReturnDto {
  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  purchaseOrderId?: string;

  @IsString()
  @IsOptional()
  rmaNumber?: string;
}

export class UpdateSupplierReturnStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsString()
  @IsOptional()
  rmaNumber?: string;
}

export class AddSupplierReturnLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsNumber()
  @IsNotEmpty()
  quantityReturned!: number;

  @IsNumber()
  @IsNotEmpty()
  unitPrice!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];
}
