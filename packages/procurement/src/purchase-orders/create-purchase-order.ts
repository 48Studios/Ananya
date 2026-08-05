import {
  PurchaseOrder,
  type CreatePurchaseOrderInput,
  type AddPoLineInput,
} from "./purchase-order";
import type { PurchaseOrderRepository } from "./purchase-order.repository";

export interface CreatePurchaseOrderWithLinesInput extends CreatePurchaseOrderInput {
  lines?: AddPoLineInput[];
}

export class CreatePurchaseOrder {
  constructor(private readonly poRepository: PurchaseOrderRepository) {}

  async execute(
    input: CreatePurchaseOrderWithLinesInput,
  ): Promise<PurchaseOrder> {
    const poNumber = input.poNumber
      ? input.poNumber
      : await this.poRepository.generateNextPoNumber();

    const po = PurchaseOrder.create({
      poNumber,
      supplierId: input.supplierId,
      currency: input.currency,
      notes: input.notes,
      expectedDeliveryDate: input.expectedDeliveryDate,
    });

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        po.addLine(line);
      }
    }

    await this.poRepository.save(po);

    return po;
  }
}
