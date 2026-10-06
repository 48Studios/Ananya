import { SPATIAL_LOCATION_CATEGORIES } from '@ananya/inventory';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
} from 'class-validator';

/**
 * Canonical categories plus the explicitly supported legacy aliases. The domain
 * aggregate remains authoritative: it canonicalizes aliases and rejects
 * anything unknown, so this list only defines the accepted request shape.
 */
export const ACCEPTED_LOCATION_KINDS = [
  ...SPATIAL_LOCATION_CATEGORIES,
  'room',
  'area',
  'tray',
  'tube',
  'rail',
  'ic_tube',
] as const;

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsIn(ACCEPTED_LOCATION_KINDS)
  kind!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  metadata?: Record<string, unknown>;
}
