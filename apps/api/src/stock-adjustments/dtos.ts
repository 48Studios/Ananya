import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStockAdjustmentLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0)
  currentQuantity!: number;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;
}

export class CreateStockAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockAdjustmentLineDto)
  lines!: CreateStockAdjustmentLineDto[];
}

export class ApproveStockAdjustmentDto {
  @IsString()
  @IsOptional()
  approvedBy?: string;
}
