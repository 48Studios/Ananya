import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { TaskPriority } from '@ananya/projects';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  assignedUser?: string;

  @IsNumber()
  @Min(0)
  estimatedHours!: number;

  @IsString()
  @IsOptional()
  priority?: TaskPriority;
}

export class AssignTaskDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
