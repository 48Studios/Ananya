import { IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';

export class StartPlanningRunDto {
  @IsNumber()
  @Min(1)
  @Max(365)
  horizonDays!: number;

  @IsString()
  @IsNotEmpty()
  startedBy!: string;
}
