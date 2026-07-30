import { db } from '@ananya/database';
import {
  suppliers,
  supplierContacts,
  supplierComponents,
  purchaseOrders,
} from '@ananya/database/schema';
import { eq, ilike, or } from '@ananya/database/query';
import type {
  SupplierRecord,
  SupplierContactRecord,
  SupplierComponentRecord,
} from '@ananya/database/schema';
import {
  Supplier,
  SupplierRepository,
  FindManySuppliersOptions,
} from '@ananya/procurement';

function toDomain(
  row: SupplierRecord,
  contacts: SupplierContactRecord[] = [],
  componentsList: SupplierComponentRecord[] = [],
): Supplier {
  return Supplier.rehydrate({
    id: row.id,
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    paymentTerms: row.paymentTerms,
    currency: row.currency,
    rating: parseFloat(row.rating ?? '5.00'),
    isActive: row.isActive,
    contacts: contacts.map((c) => ({
      id: c.id,
      supplierId: c.supplierId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      isPrimary: c.isPrimary,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    components: componentsList.map((cp) => ({
      id: cp.id,
      supplierId: cp.supplierId,
      componentId: cp.componentId,
      vendorPartNumber: cp.vendorPartNumber,
      leadTimeDays: cp.leadTimeDays,
      minimumOrderQuantity: cp.minimumOrderQuantity,
      orderMultiple: cp.orderMultiple,
      unitPrice: parseFloat(cp.unitPrice),
      currency: cp.currency,
      createdAt: cp.createdAt,
      updatedAt: cp.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleSupplierRepository implements SupplierRepository {
  async findById(id: string): Promise<Supplier | null> {
    const [row] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, id))
      .limit(1);

    if (!row) return null;

    const contacts = await db
      .select()
      .from(supplierContacts)
      .where(eq(supplierContacts.supplierId, id));

    const componentsList = await db
      .select()
      .from(supplierComponents)
      .where(eq(supplierComponents.supplierId, id));

    return toDomain(row, contacts, componentsList);
  }

  async findByCode(code: string): Promise<Supplier | null> {
    const [row] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.code, code.toUpperCase()))
      .limit(1);

    if (!row) return null;

    const contacts = await db
      .select()
      .from(supplierContacts)
      .where(eq(supplierContacts.supplierId, row.id));

    const componentsList = await db
      .select()
      .from(supplierComponents)
      .where(eq(supplierComponents.supplierId, row.id));

    return toDomain(row, contacts, componentsList);
  }

  async findMany(options?: FindManySuppliersOptions): Promise<Supplier[]> {
    const query = db.select().from(suppliers);

    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(
        or(ilike(suppliers.name, pattern), ilike(suppliers.code, pattern)),
      );
    }

    const rows = await query.orderBy(suppliers.name);

    return Promise.all(
      rows.map(async (row) => {
        const contacts = await db
          .select()
          .from(supplierContacts)
          .where(eq(supplierContacts.supplierId, row.id));
        const componentsList = await db
          .select()
          .from(supplierComponents)
          .where(eq(supplierComponents.supplierId, row.id));
        return toDomain(row, contacts, componentsList);
      }),
    );
  }

  async save(supplier: Supplier): Promise<void> {
    await db
      .insert(suppliers)
      .values({
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        taxId: supplier.taxId ?? null,
        paymentTerms: supplier.paymentTerms,
        currency: supplier.currency,
        rating: supplier.rating.toString(),
        isActive: supplier.isActive,
      })
      .onConflictDoUpdate({
        target: suppliers.id,
        set: {
          name: supplier.name,
          taxId: supplier.taxId ?? null,
          paymentTerms: supplier.paymentTerms,
          currency: supplier.currency,
          rating: supplier.rating.toString(),
          isActive: supplier.isActive,
          updatedAt: new Date(),
        },
      });
  }

  async update(supplier: Supplier): Promise<Supplier> {
    const [row] = await db
      .update(suppliers)
      .set({
        code: supplier.code,
        name: supplier.name,
        taxId: supplier.taxId ?? null,
        paymentTerms: supplier.paymentTerms,
        currency: supplier.currency,
        rating: supplier.rating.toString(),
        isActive: supplier.isActive,
        updatedAt: supplier.updatedAt,
      })
      .where(eq(suppliers.id, supplier.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update supplier: ${supplier.id}`);
    }

    const contacts = await db
      .select()
      .from(supplierContacts)
      .where(eq(supplierContacts.supplierId, supplier.id));

    const componentsList = await db
      .select()
      .from(supplierComponents)
      .where(eq(supplierComponents.supplierId, supplier.id));

    return toDomain(row, contacts, componentsList);
  }

  async delete(id: string): Promise<void> {
    await db.delete(suppliers).where(eq(suppliers.id, id));
  }

  async hasPurchaseOrders(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, id))
      .limit(1);

    return Boolean(row);
  }

  async addContact(contact: {
    supplierId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
  }): Promise<void> {
    await db.insert(supplierContacts).values({
      supplierId: contact.supplierId,
      name: contact.name,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      role: contact.role ?? null,
      isPrimary: contact.isPrimary ?? false,
    });
  }

  async deleteContact(supplierId: string, contactId: string): Promise<void> {
    await db.delete(supplierContacts).where(eq(supplierContacts.id, contactId));
  }

  async mapComponent(mapping: {
    supplierId: string;
    componentId: string;
    vendorPartNumber: string;
    leadTimeDays?: number;
    minimumOrderQuantity?: number;
    orderMultiple?: number;
    unitPrice?: number;
    currency?: string;
  }): Promise<void> {
    await db.insert(supplierComponents).values({
      supplierId: mapping.supplierId,
      componentId: mapping.componentId,
      vendorPartNumber: mapping.vendorPartNumber,
      leadTimeDays: mapping.leadTimeDays ?? 7,
      minimumOrderQuantity: mapping.minimumOrderQuantity ?? 1,
      orderMultiple: mapping.orderMultiple ?? 1,
      unitPrice: (mapping.unitPrice ?? 0).toString(),
      currency: mapping.currency ?? 'USD',
    });
  }

  async removeComponentMapping(
    supplierId: string,
    mappingId: string,
  ): Promise<void> {
    await db
      .delete(supplierComponents)
      .where(eq(supplierComponents.id, mappingId));
  }
}
