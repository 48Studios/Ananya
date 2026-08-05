import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const crmAccounts = pgTable(
  "crm_accounts",
  {
    id: uuid("id").primaryKey(),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    industry: varchar("industry", { length: 100 }),
    website: varchar("website", { length: 255 }),
    billingAddress: text("billing_address"),
    shippingAddress: text("shipping_address"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crm_accounts_company_name_idx").on(table.companyName),
    index("crm_accounts_is_archived_idx").on(table.isArchived),
  ],
);

export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").primaryKey(),
    crmAccountId: uuid("crm_account_id")
      .notNull()
      .references(() => crmAccounts.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    role: varchar("role", { length: 50 }).notNull().default("OTHER"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crm_contacts_account_id_idx").on(table.crmAccountId),
    index("crm_contacts_email_idx").on(table.email),
  ],
);

export type CrmAccountRecord = InferSelectModel<typeof crmAccounts>;
export type NewCrmAccountRecord = InferInsertModel<typeof crmAccounts>;
export type CrmContactRecord = InferSelectModel<typeof crmContacts>;
export type NewCrmContactRecord = InferInsertModel<typeof crmContacts>;
