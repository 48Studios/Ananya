import { Supplier, type CreateSupplierInput } from "./supplier";
import { DuplicateSupplierCodeError } from "./supplier.errors";
import type { SupplierRepository } from "./supplier.repository";

export class CreateSupplier {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: CreateSupplierInput): Promise<Supplier> {
    const code = input.code.trim().toUpperCase();

    const existing = await this.suppliers.findByCode(code);
    if (existing) {
      throw new DuplicateSupplierCodeError(code);
    }

    const supplier = Supplier.create(input);
    await this.suppliers.save(supplier);

    return supplier;
  }
}
