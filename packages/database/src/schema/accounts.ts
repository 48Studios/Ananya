import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    accountNumber: varchar("account_number", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    accountType: varchar("account_type", { length: 50 }).notNull(),
    parentAccountId: uuid("parent_account_id"),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accounts_account_type_idx").on(table.accountType),
    index("accounts_is_active_idx").on(table.isActive),
  ],
);

export type AccountRecord = InferSelectModel<typeof accounts>;
export type NewAccountRecord = InferInsertModel<typeof accounts>;
