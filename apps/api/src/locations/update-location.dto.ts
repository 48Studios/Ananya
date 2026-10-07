import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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

  // Same request-shape rule as CreateLocationDto: `parentId` is a location id,
  // so it must be a UUID (or explicitly null to clear the parent).
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  /**
   * Physical container (RFC-0069). On update, `undefined` leaves the existing
   * container unchanged while `null` explicitly clears it. Independent of
   * `parentId`.
   */
  @IsOptional()
  @IsUUID()
  containerId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
