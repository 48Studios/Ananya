import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category!: string;

  @IsNotEmpty()
  isBaseUnit!: boolean;

  @IsOptional()
  @IsNumber()
  conversionFactor?: number;

  /**
   * Zero-point shift for an affine unit (`°F` is −32 against `°C`), applied
   * before the conversion factor. Optional: a multiplicative unit has none.
   */
  @IsOptional()
  @IsNumber()
  conversionOffset?: number;

  @IsNumber()
  @IsNotEmpty()
  precision!: number;
}
