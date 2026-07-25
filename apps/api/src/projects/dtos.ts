import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ProjectPriority } from '@ananya/projects';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  salesOrderId!: string;

  @IsString()
  @IsNotEmpty()
  projectManager!: string;

  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @IsDateString()
  @IsNotEmpty()
  targetCompletionDate!: string;

  @IsString()
  @IsOptional()
  priority?: ProjectPriority;
}

export class AddMilestoneDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  completionPercentage?: number;
}
