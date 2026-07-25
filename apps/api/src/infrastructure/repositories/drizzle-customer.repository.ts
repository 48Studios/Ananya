import { db } from '@ananya/database';
import {
  customers,
  customerContacts,
  customerAddresses,
} from '@ananya/database/schema';
import { eq, desc, count, ilike, or } from '@ananya/database/query';
import type {
  CustomerRecord,
  CustomerContactRecord,
  CustomerAddressRecord,
} from '@ananya/database/schema';
import {
  Customer,
  type CustomerRepository,
  type CustomerStatus,
  type CreditStatus,
  type AddressType,
  type FindManyCustomersOptions,
} from '@ananya/sales';

function toDomain(
  row: CustomerRecord,
  contacts: CustomerContactRecord[] = [],
  addresses: CustomerAddressRecord[] = [],
): Customer {
  return Customer.rehydrate({
    id: row.id,
    customerNumber: row.customerNumber,
    name: row.name,
    email: row.email,
    phone: row.phone,
    taxId: row.taxId,
    currency: row.currency,
    status: row.status as CustomerStatus,
    creditStatus: row.creditStatus as CreditStatus,
    contacts: contacts.map((c) => ({
      id: c.id,
      customerId: c.customerId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      isPrimary: c.isPrimary,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    addresses: addresses.map((a) => ({
      id: a.id,
      customerId: a.customerId,
      addressType: a.addressType as AddressType,
      street1: a.street1,
      street2: a.street2,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
      isDefault: a.isDefault,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCustomerRepository implements CustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    const [row] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    if (!row) return null;
    const contacts = await db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, id));
    const addresses = await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, id));
    return toDomain(row, contacts, addresses);
  }

  async findByNumber(customerNumber: string): Promise<Customer | null> {
    const [row] = await db
      .select()
      .from(customers)
      .where(eq(customers.customerNumber, customerNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const contacts = await db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, row.id));
    const addresses = await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, row.id));
    return toDomain(row, contacts, addresses);
  }

  async findMany(options?: FindManyCustomersOptions): Promise<Customer[]> {
    const query = db.select().from(customers);
    if (options?.status) {
      query.where(eq(customers.status, options.status));
    }
    if (options?.search) {
      const term = `%${options.search}%`;
      query.where(
        or(
          ilike(customers.name, term),
          ilike(customers.customerNumber, term),
          ilike(customers.email, term),
        ),
      );
    }
    const rows = await query.orderBy(desc(customers.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const contacts = await db
          .select()
          .from(customerContacts)
          .where(eq(customerContacts.customerId, row.id));
        const addresses = await db
          .select()
          .from(customerAddresses)
          .where(eq(customerAddresses.customerId, row.id));
        return toDomain(row, contacts, addresses);
      }),
    );
  }

  async save(customer: Customer): Promise<void> {
    await db
      .insert(customers)
      .values({
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        taxId: customer.taxId ?? null,
        currency: customer.currency,
        status: customer.status,
        creditStatus: customer.creditStatus,
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone ?? null,
          taxId: customer.taxId ?? null,
          currency: customer.currency,
          status: customer.status,
          creditStatus: customer.creditStatus,
          updatedAt: new Date(),
        },
      });

    for (const contact of customer.contacts) {
      await db
        .insert(customerContacts)
        .values({
          id: contact.id,
          customerId: customer.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone ?? null,
          role: contact.role ?? null,
          isPrimary: contact.isPrimary,
        })
        .onConflictDoUpdate({
          target: customerContacts.id,
          set: {
            name: contact.name,
            email: contact.email,
            phone: contact.phone ?? null,
            role: contact.role ?? null,
            isPrimary: contact.isPrimary,
            updatedAt: new Date(),
          },
        });
    }

    for (const address of customer.addresses) {
      await db
        .insert(customerAddresses)
        .values({
          id: address.id,
          customerId: customer.id,
          addressType: address.addressType,
          street1: address.street1,
          street2: address.street2 ?? null,
          city: address.city,
          state: address.state ?? null,
          postalCode: address.postalCode,
          country: address.country,
          isDefault: address.isDefault,
        })
        .onConflictDoUpdate({
          target: customerAddresses.id,
          set: {
            addressType: address.addressType,
            street1: address.street1,
            street2: address.street2 ?? null,
            city: address.city,
            state: address.state ?? null,
            postalCode: address.postalCode,
            country: address.country,
            isDefault: address.isDefault,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextCustomerNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(customers);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `CUST-${year}-${num}`;
  }
}
