import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  NotContains,
} from 'class-validator';

export class UpdateSpatialModelDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @IsIn([
    'GLB',
    'GLTF',
    'SVG',
    'PROCEDURAL',
    'glb',
    'gltf',
    'svg',
    'procedural',
  ])
  format?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  @NotContains('..', {
    message: 'assetUri must not contain path traversal sequences (..)',
  })
  @NotContains('\\', {
    message: 'assetUri must not contain backslashes',
  })
  @Matches(
    /^(https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?\/[^\s?#]*|\/(?!\/)[^\s?#]*)(\.glb|\.gltf)((\?|#)[^\s]*)?$/i,
    {
      message:
        'assetUri must be an http(s) URL or relative path ending with .glb or .gltf without credentials or path traversal',
    },
  )
  assetUri?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  thumbnailUri?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  widthMm?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  heightMm?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  depthMm?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
