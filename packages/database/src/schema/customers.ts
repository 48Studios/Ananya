import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey(),
    customerNumber: varchar('customer_number', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    taxId: varchar('tax_id', { length: 100 }),
    currency: varchar('currency', { length: 10 }).notNull().default('USD'),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),
    creditStatus: varchar('credit_status', { length: 50 }).notNull().default('OK'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('customers_status_idx').on(table.status),
    index('customers_email_idx').on(table.email),
  ],
);

export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: uuid('id').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    role: varchar('role', { length: 100 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('customer_contacts_customer_id_idx').on(table.customerId)],
);

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: uuid('id').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    addressType: varchar('address_type', { length: 50 }).notNull().default('BILLING'),
    street1: varchar('street1', { length: 255 }).notNull(),
    street2: varchar('street2', { length: 255 }),
    city: varchar('city', { length: 100 }).notNull(),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 50 }).notNull(),
    country: varchar('country', { length: 100 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('customer_addresses_customer_id_idx').on(table.customerId)],
);

export type CustomerRecord = InferSelectModel<typeof customers>;
export type NewCustomerRecord = InferInsertModel<typeof customers>;
export type CustomerContactRecord = InferSelectModel<typeof customerContacts>;
export type CustomerAddressRecord = InferSelectModel<typeof customerAddresses>;
