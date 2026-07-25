import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class SaveWarehousePolicyDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsBoolean()
  @IsOptional()
  allowNegativeInventory?: boolean;

  @IsBoolean()
  @IsOptional()
  enforceBinCapacity?: boolean;

  @IsBoolean()
  @IsOptional()
  directedPutaway?: boolean;

  @IsBoolean()
  @IsOptional()
  directedPicking?: boolean;

  @IsString()
  @IsOptional()
  defaultReceivingBinId?: string;

  @IsString()
  @IsOptional()
  defaultProductionBinId?: string;

  @IsString()
  @IsOptional()
  defaultShippingBinId?: string;
}
