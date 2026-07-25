import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateProductionRecommendationDto {
  @IsString()
  @IsNotEmpty()
  planningRunId!: string;

  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  suggestedQuantity!: number;

  @IsDateString()
  @IsNotEmpty()
  suggestedStart!: string;

  @IsDateString()
  @IsNotEmpty()
  suggestedCompletion!: string;

  @IsString()
  @IsOptional()
  manufacturingRoute?: string;
}
