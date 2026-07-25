import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateFulfillmentRequestDto {
  @IsString()
  @IsNotEmpty()
  salesOrderId!: string;

  @IsString()
  @IsNotEmpty()
  warehouseId!: string;
}

export class AddFulfillmentLineDto {
  @IsString()
  @IsNotEmpty()
  salesOrderLineId!: string;

  @IsString()
  @IsNotEmpty()
  componentId!: string;

  @IsNumber()
  @Min(0.0001)
  requestedQuantity!: number;
}

export class ShipFulfillmentRequestDto {
  @IsString()
  @IsNotEmpty()
  carrierName!: string;

  @IsString()
  @IsNotEmpty()
  trackingNumber!: string;
}
