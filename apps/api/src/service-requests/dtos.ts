import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ServicePriority, ServiceCategory } from '@ananya/service';

export class CreateServiceRequestDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsOptional()
  salesOrderId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  componentId?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  priority?: ServicePriority;

  @IsString()
  @IsNotEmpty()
  category!: ServiceCategory;
}

export class AssignServiceRequestDto {
  @IsString()
  @IsNotEmpty()
  technician!: string;
}

export class DiagnoseServiceRequestDto {
  @IsString()
  @IsNotEmpty()
  notes!: string;
}
