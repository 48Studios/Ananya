import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    paymentNumber: varchar("payment_number", { length: 50 }).notNull().unique(),
    paymentType: varchar("payment_type", { length: 50 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    reference: varchar("reference", { length: 100 }),
    bankAccountId: uuid("bank_account_id"),
    status: varchar("status", { length: 50 }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payments_payment_type_idx").on(table.paymentType),
    index("payments_bank_account_id_idx").on(table.bankAccountId),
    index("payments_status_idx").on(table.status),
  ],
);

export type PaymentRecord = InferSelectModel<typeof payments>;
export type NewPaymentRecord = InferInsertModel<typeof payments>;
