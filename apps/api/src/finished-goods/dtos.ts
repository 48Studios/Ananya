import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
} from 'class-validator';

export class CreateFinishedGoodsDto {
  @IsString()
  @IsNotEmpty()
  productionOrderId!: string;
}

export class AddFgrLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsNumber()
  @Min(0)
  quantityProduced!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  quantityScrapped?: number;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsArray()
  @IsOptional()
  serialNumbers?: string[];
}
