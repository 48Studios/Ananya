import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PublishSpatialLayoutDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedRevision!: number;

  @IsString()
  @IsOptional()
  changeDescription?: string;

  @IsBoolean()
  @IsOptional()
  overwriteManualSpatialNodes?: boolean;
}
