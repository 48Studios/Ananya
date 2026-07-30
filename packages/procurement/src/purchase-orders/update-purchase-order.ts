import {
  PurchaseOrder,
  type UpdatePurchaseOrderInput,
  type AddPoLineInput,
} from "./purchase-order";
import { PurchaseOrderNotFoundError } from "./purchase-order.errors";
import type { PurchaseOrderRepository } from "./purchase-order.repository";

export interface UpdatePurchaseOrderWithLinesInput extends UpdatePurchaseOrderInput {
  lines?: AddPoLineInput[];
}

export class UpdatePurchaseOrder {
  constructor(private readonly poRepository: PurchaseOrderRepository) {}

  async execute(
    id: string,
    input: UpdatePurchaseOrderWithLinesInput,
  ): Promise<PurchaseOrder> {
    const existing = await this.poRepository.findById(id);

    if (!existing) {
      throw new PurchaseOrderNotFoundError(id);
    }

    existing.updateHeader({
      notes: input.notes,
      expectedDeliveryDate: input.expectedDeliveryDate,
    });

    if (input.lines !== undefined) {
      existing.clearLines();
      for (const line of input.lines) {
        existing.addLine(line);
      }
    }

    await this.poRepository.save(existing);

    return existing;
  }
}
