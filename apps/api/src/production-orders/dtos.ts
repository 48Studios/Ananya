import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';

export enum WorkOrderPriorityEnum {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class CreateProductionOrderDto {
  @IsString()
  @IsNotEmpty()
  bomId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsOptional()
  locationId?: string;

  @IsNumber()
  @Min(1)
  quantityPlanned!: number;

  @IsEnum(WorkOrderPriorityEnum)
  @IsOptional()
  priority?: WorkOrderPriorityEnum;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateProductionOrderDto {
  @IsString()
  @IsOptional()
  locationId?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  quantityPlanned?: number;

  @IsEnum(WorkOrderPriorityEnum)
  @IsOptional()
  priority?: WorkOrderPriorityEnum;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordPartialOutputDto {
  @IsNumber()
  @Min(1)
  producedQuantity!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  scrappedQuantity?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordScrapDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CompleteProductionOrderDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  producedQuantity?: number;
}
