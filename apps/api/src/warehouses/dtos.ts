import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class AddBinDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  capacity?: number;

  @IsString()
  @IsOptional()
  purpose?:
    'RECEIVING' | 'STORAGE' | 'PRODUCTION' | 'SHIPPING' | 'QUALITY_HOLD';
}

export class UpdateBinDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  capacity?: number;
}
