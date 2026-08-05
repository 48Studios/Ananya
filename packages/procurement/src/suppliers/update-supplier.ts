import { Supplier, type UpdateSupplierInput } from "./supplier";
import {
  DuplicateSupplierCodeError,
  SupplierNotFoundError,
} from "./supplier.errors";
import type { SupplierRepository } from "./supplier.repository";

export class UpdateSupplier {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(id: string, input: UpdateSupplierInput): Promise<Supplier> {
    const existing = await this.suppliers.findById(id);

    if (!existing) {
      throw new SupplierNotFoundError(id);
    }

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      if (code !== existing.code) {
        const withCode = await this.suppliers.findByCode(code);
        if (withCode && withCode.id !== id) {
          throw new DuplicateSupplierCodeError(code);
        }
      }
    }

    const updatedSupplier = existing.update(input);

    return this.suppliers.update(updatedSupplier);
  }
}
