import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsObject,
} from 'class-validator';
import { CountFrequency } from '@ananya/warehouse';

export class CreateCycleCountDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  frequency!: CountFrequency;

  @IsObject()
  @IsOptional()
  selectionRule?: Record<string, unknown>;

  @IsDateString()
  @IsOptional()
  nextScheduledDate?: string;
}
