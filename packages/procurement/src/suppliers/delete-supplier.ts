import {
  SupplierNotFoundError,
  SupplierHasPurchaseOrdersError,
} from "./supplier.errors";
import type { SupplierRepository } from "./supplier.repository";

export class DeleteSupplier {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.suppliers.findById(id);

    if (!existing) {
      throw new SupplierNotFoundError(id);
    }

    const hasPOs = await this.suppliers.hasPurchaseOrders(id);
    if (hasPOs) {
      throw new SupplierHasPurchaseOrdersError(id);
    }

    await this.suppliers.delete(id);
  }
}
