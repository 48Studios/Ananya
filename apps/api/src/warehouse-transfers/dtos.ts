import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
} from 'class-validator';

export class CreateWarehouseTransferDto {
  @IsString()
  @IsNotEmpty()
  sourceBinId!: string;

  @IsString()
  @IsNotEmpty()
  destinationBinId!: string;
}

export class AddTransferLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsArray()
  @IsOptional()
  serialNumbers?: string[];
}
