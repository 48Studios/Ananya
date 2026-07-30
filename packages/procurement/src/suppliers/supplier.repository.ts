import { Supplier } from "./supplier";

export interface FindManySuppliersOptions {
  search?: string;
  isActive?: boolean;
}

export interface SupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  findByCode(code: string): Promise<Supplier | null>;
  findMany(options?: FindManySuppliersOptions): Promise<Supplier[]>;
  save(supplier: Supplier): Promise<void>;
  update(supplier: Supplier): Promise<Supplier>;
  delete(id: string): Promise<void>;
  hasPurchaseOrders(id: string): Promise<boolean>;
  addContact(contact: {
    supplierId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
  }): Promise<void>;
  deleteContact(supplierId: string, contactId: string): Promise<void>;
  mapComponent(mapping: {
    supplierId: string;
    componentId: string;
    vendorPartNumber: string;
    leadTimeDays?: number;
    minimumOrderQuantity?: number;
    orderMultiple?: number;
    unitPrice?: number;
    currency?: string;
  }): Promise<void>;
  removeComponentMapping(supplierId: string, mappingId: string): Promise<void>;
}
