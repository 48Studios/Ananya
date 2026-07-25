import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateProductionOrderDto {
  @IsString()
  @IsNotEmpty()
  bomId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(1)
  quantityPlanned!: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
