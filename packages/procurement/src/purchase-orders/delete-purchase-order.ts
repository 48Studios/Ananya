import {
  PurchaseOrderNotFoundError,
  PurchaseOrderCannotBeDeletedError,
} from "./purchase-order.errors";
import type { PurchaseOrderRepository } from "./purchase-order.repository";

export class DeletePurchaseOrder {
  constructor(private readonly poRepository: PurchaseOrderRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.poRepository.findById(id);

    if (!existing) {
      throw new PurchaseOrderNotFoundError(id);
    }

    if (!["DRAFT", "CANCELLED"].includes(existing.status)) {
      throw new PurchaseOrderCannotBeDeletedError(existing.status);
    }

    await this.poRepository.delete(id);
  }
}
