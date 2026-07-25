import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreatePurchaseRecommendationDto {
  @IsString()
  @IsNotEmpty()
  planningRunId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsNumber()
  @Min(0.0001)
  suggestedQuantity!: number;

  @IsString()
  @IsNotEmpty()
  requiredDate!: string;

  @IsString()
  @IsNotEmpty()
  recommendationReason!: string;
}
