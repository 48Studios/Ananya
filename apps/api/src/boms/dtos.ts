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
  @Min(0)
  @IsOptional()
  scrapFactorPercent?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddBomLineDto)
  lines?: AddBomLineDto[];
}

export class UpdateBomDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddBomLineDto)
  lines?: AddBomLineDto[];
}

export class DuplicateBomDto {
  @IsString()
  @IsOptional()
  newRevision?: string;
}
