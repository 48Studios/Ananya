import { IsString, IsNotEmpty } from 'class-validator';
import { MessageSeverity } from '@ananya/mrp';

export class CreatePlanningMessageDto {
  @IsString()
  @IsNotEmpty()
  planningRunId!: string;

  @IsString()
  @IsNotEmpty()
  severity!: MessageSeverity;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
