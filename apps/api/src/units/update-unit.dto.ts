import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isBaseUnit?: boolean;

  @IsOptional()
  @IsNumber()
  conversionFactor?: number;

  @IsOptional()
  @IsNumber()
  precision?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
