import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
} from 'class-validator';

export class CreateMaterialConsumptionDto {
  @IsString()
  @IsNotEmpty()
  productionOrderId!: string;
}

export class AddConsumptionLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsNumber()
  @IsOptional()
  quantityPlanned?: number;

  @IsNumber()
  @Min(0.0001)
  quantityConsumed!: number;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsArray()
  @IsOptional()
  serialNumbers?: string[];
}
