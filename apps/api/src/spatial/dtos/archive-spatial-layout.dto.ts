import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ArchiveSpatialLayoutDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedRevision!: number;

  @IsString()
  @IsOptional()
  changeDescription?: string;
}
