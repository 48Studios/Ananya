import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CycleCountLineInputDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0)
  systemQuantity!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  countedQuantity?: number;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateCycleCountDto {
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsString()
  @IsOptional()
  assignedCounter?: string;

  @IsString()
  @IsOptional()
  scheduledDate?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleCountLineInputDto)
  @IsOptional()
  lines?: CycleCountLineInputDto[];
}

export class UpdateCycleCountDto {
  @IsString()
  @IsOptional()
  locationId?: string;

  @IsString()
  @IsOptional()
  assignedCounter?: string;

  @IsString()
  @IsOptional()
  scheduledDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleCountLineInputDto)
  @IsOptional()
  lines?: CycleCountLineInputDto[];
}

export class AssignCounterDto {
  @IsString()
  @IsNotEmpty()
  assignedCounter!: string;
}

export class PhysicalCountEntryDto {
  @IsString()
  @IsNotEmpty()
  lineId!: string;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordPhysicalCountsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhysicalCountEntryDto)
  counts!: PhysicalCountEntryDto[];
}

export class ApproveCycleCountDto {
  @IsString()
  @IsOptional()
  approvedBy?: string;
}
