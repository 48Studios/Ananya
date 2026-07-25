import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateBomDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsOptional()
  revision?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddBomLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantityPerUnit!: number;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;

  @IsNumber()
  @IsOptional()
  scrapFactorPercent?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
