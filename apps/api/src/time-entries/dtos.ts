import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class CreateTimeEntryDto {
  /**
   * Target employee identity. If omitted or equal to caller's ID, the entry
   * is logged for the authenticated user (self-service). Logging on behalf of
   * another employee requires manager/administrator privileges.
   */
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @IsNumber()
  @Min(0.1)
  @Max(24)
  hours!: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ApproveTimeEntryDto {
  /**
   * Client-supplied approver identity is ignored; the approver is
   * always authoritatively bound to req.user.id server-side.
   */
  @IsString()
  @IsOptional()
  approverId?: string;
}
