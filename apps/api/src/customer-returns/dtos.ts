import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsObject,
  Min,
} from 'class-validator';
import { ReturnReason, ReturnDisposition } from '@ananya/sales';

export class CreateCustomerReturnDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  salesOrderId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddReturnLineDto {
  @IsString()
  @IsNotEmpty()
  salesOrderLineId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  reason!: ReturnReason;
}

export class InspectReturnDto {
  @IsObject()
  @IsNotEmpty()
  dispositions!: Record<string, ReturnDisposition>;
}
