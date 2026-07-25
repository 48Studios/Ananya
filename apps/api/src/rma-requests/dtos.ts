import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { RmaDisposition } from '@ananya/service';

export class CreateRmaRequestDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsOptional()
  salesOrderId?: string;

  @IsString()
  @IsNotEmpty()
  itemDescription!: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class InspectRmaDto {
  @IsString()
  @IsNotEmpty()
  disposition!: RmaDisposition;

  @IsString()
  @IsOptional()
  notes?: string;
}
