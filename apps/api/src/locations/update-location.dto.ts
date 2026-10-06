import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ACCEPTED_LOCATION_KINDS } from './create-location.dto';

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(ACCEPTED_LOCATION_KINDS)
  kind?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
