import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateStockCountDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsString()
  @IsOptional()
  assignedUser?: string;
}

export class AddCountLineDto {
  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsString()
  @IsNotEmpty()
  binId!: string;

  @IsNumber()
  @IsOptional()
  expectedQuantity?: number;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AssignCounterDto {
  @IsString()
  @IsNotEmpty()
  assignedUser!: string;
}
