import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateWarehouseTransferDto {
  @IsString()
  @IsNotEmpty()
  sourceLocationId!: string;

  @IsString()
  @IsNotEmpty()
  destinationLocationId!: string;

  @IsString()
  @IsOptional()
  requestedDate?: string;

  @IsString()
  @IsOptional()
  requestedBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  @IsOptional()
  lines?: TransferLineDto[];
}

export class UpdateWarehouseTransferDto {
  @IsString()
  @IsOptional()
  sourceLocationId?: string;

  @IsString()
  @IsOptional()
  destinationLocationId?: string;

  @IsString()
  @IsOptional()
  requestedDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  @IsOptional()
  lines?: TransferLineDto[];
}

export class AddTransferLineDto extends TransferLineDto {}
