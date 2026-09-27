import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TransactionType } from '@ananya/inventory';

export class CreateInventoryTransactionDto {
  @IsString()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  unitOfMeasure!: string;

  @IsOptional()
  @IsString()
  sourceLocationId?: string;

  @IsOptional()
  @IsString()
  destinationLocationId?: string;

  @IsEnum(TransactionType)
  transactionType!: TransactionType;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * Client-supplied createdBy is optional and ignored; audit attribution
   * is authoritatively bound to req.user.id on the server.
   */
  @IsOptional()
  @IsString()
  createdBy?: string;
}
