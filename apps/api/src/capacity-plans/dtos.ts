import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateCapacityPlanDto {
  @IsString()
  @IsNotEmpty()
  planningRunId!: string;

  @IsString()
  @IsNotEmpty()
  workCenterId!: string;

  @IsString()
  @IsNotEmpty()
  workCenterName!: string;

  @IsNumber()
  @Min(0.1)
  availableCapacityHours!: number;

  @IsNumber()
  @Min(0)
  plannedCapacityHours!: number;
}
