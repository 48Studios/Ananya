import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { WorkOrderPriority } from '@ananya/service';

export class CreateWorkOrderDto {
  @IsString()
  @IsNotEmpty()
  serviceRequestId!: string;

  @IsString()
  @IsOptional()
  assignedTechnician?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  plannedHours!: number;

  @IsString()
  @IsOptional()
  priority?: WorkOrderPriority;
}

export class AssignWorkOrderDto {
  @IsString()
  @IsNotEmpty()
  technician!: string;
}

export class LogWorkOrderHoursDto {
  @IsNumber()
  @Min(0.1)
  hours!: number;
}
