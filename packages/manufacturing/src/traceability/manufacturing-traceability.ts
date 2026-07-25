import { ObjectId } from "@ananya/core";

export type TraceabilityEventType =
  | "MATERIAL_CONSUMED"
  | "FINISHED_GOODS_PRODUCED";

export interface ManufacturingTraceabilityProps {
  id: string;
  eventType: TraceabilityEventType;
  productionOrderId: string;
  consumptionId?: string | null;
  fgrId?: string | null;
  componentId: string;
  locationId?: string | null;
  quantity: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
  createdAt: Date;
}

export interface CreateTraceabilityInput {
  eventType: TraceabilityEventType;
  productionOrderId: string;
  consumptionId?: string | null;
  fgrId?: string | null;
  componentId: string;
  locationId?: string | null;
  quantity: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
}

export class ManufacturingTraceability {
  public readonly id: string;
  public readonly eventType: TraceabilityEventType;
  public readonly productionOrderId: string;
  public readonly consumptionId?: string | null;
  public readonly fgrId?: string | null;
  public readonly componentId: string;
  public readonly locationId?: string | null;
  public readonly quantity: number;
  public readonly batchNumber?: string | null;
  public readonly serialNumbers?: string[] | null;
  public readonly createdAt: Date;

  private constructor(props: ManufacturingTraceabilityProps) {
    this.id = props.id;
    this.eventType = props.eventType;
    this.productionOrderId = props.productionOrderId;
    this.consumptionId = props.consumptionId;
    this.fgrId = props.fgrId;
    this.componentId = props.componentId;
    this.locationId = props.locationId;
    this.quantity = props.quantity;
    this.batchNumber = props.batchNumber;
    this.serialNumbers = props.serialNumbers;
    this.createdAt = props.createdAt;
  }

  public static create(
    input: CreateTraceabilityInput,
  ): ManufacturingTraceability {
    return new ManufacturingTraceability({
      id: ObjectId.generate().value,
      eventType: input.eventType,
      productionOrderId: input.productionOrderId,
      consumptionId: input.consumptionId ?? null,
      fgrId: input.fgrId ?? null,
      componentId: input.componentId,
      locationId: input.locationId ?? null,
      quantity: input.quantity,
      batchNumber: input.batchNumber ?? null,
      serialNumbers: input.serialNumbers ?? null,
      createdAt: new Date(),
    });
  }

  public static rehydrate(
    props: ManufacturingTraceabilityProps,
  ): ManufacturingTraceability {
    return new ManufacturingTraceability(props);
  }
}
