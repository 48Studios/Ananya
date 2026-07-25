import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class CreateTimeEntryDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @IsNumber()
  @Min(0.1)
  @Max(24)
  hours!: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ApproveTimeEntryDto {
  @IsString()
  @IsNotEmpty()
  approverId!: string;
}
