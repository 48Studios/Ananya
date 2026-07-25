import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { RequirementSource } from '@ananya/mrp';

export class CreateMaterialRequirementDto {
  @IsString()
  @IsNotEmpty()
  planningRunId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  requiredQuantity!: number;

  @IsNumber()
  @Min(0)
  availableQuantity!: number;

  @IsNumber()
  @Min(0)
  reservedQuantity!: number;

  @IsString()
  @IsNotEmpty()
  requiredDate!: string;

  @IsString()
  @IsNotEmpty()
  source!: RequirementSource;

  @IsString()
  @IsOptional()
  sourceReferenceId?: string;
}
