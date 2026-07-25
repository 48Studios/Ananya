import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ServiceFrequency } from '@ananya/service';

export class CreateMaintenanceScheduleDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  assetName!: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsNotEmpty()
  frequency!: ServiceFrequency;

  @IsDateString()
  @IsNotEmpty()
  nextVisitDate!: string;

  @IsString()
  @IsOptional()
  assignedTechnician?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
