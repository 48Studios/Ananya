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

export type ReservationTypeDto =
  'WORK_ORDER' | 'PROJECT' | 'PURCHASE_REQUEST' | 'SALES_ORDER';

export class ReservationLineInputDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsNumber()
  @Min(0.0001)
  reservedQuantity!: number;

  @IsString()
  @IsOptional()
  unitOfMeasure?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  reservationType!: ReservationTypeDto;

  @IsString()
  @IsOptional()
  referenceDocument?: string;

  @IsString()
  @IsNotEmpty()
  reservedBy!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReservationLineInputDto)
  @IsOptional()
  lines?: ReservationLineInputDto[];
}

export class UpdateReservationDto {
  @IsString()
  @IsOptional()
  reservationType?: ReservationTypeDto;

  @IsString()
  @IsOptional()
  referenceDocument?: string;

  @IsString()
  @IsOptional()
  reservedBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReservationLineInputDto)
  @IsOptional()
  lines?: ReservationLineInputDto[];
}
