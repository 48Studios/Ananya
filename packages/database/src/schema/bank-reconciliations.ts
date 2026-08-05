import {
  pgTable,
  uuid,
  varchar,
  boolean,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { payments } from "./payments";

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountNumber: varchar("account_number", { length: 50 }).notNull().unique(),
    bankName: varchar("bank_name", { length: 255 }).notNull(),
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
    index("bank_accounts_bank_name_idx").on(table.bankName),
    index("bank_accounts_is_active_idx").on(table.isActive),
  ],
);

export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: uuid("id").primaryKey(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    statementDate: timestamp("statement_date", {
      withTimezone: true,
    }).notNull(),
    openingBalance: numeric("opening_balance", {
      precision: 14,
      scale: 4,
    }).notNull(),
    closingBalance: numeric("closing_balance", {
      precision: 14,
      scale: 4,
    }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("IN_PROGRESS"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bank_reconciliations_account_id_idx").on(table.bankAccountId),
    index("bank_reconciliations_status_idx").on(table.status),
  ],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey(),
    bankReconciliationId: uuid("bank_reconciliation_id")
      .notNull()
      .references(() => bankReconciliations.id, { onDelete: "cascade" }),
    transactionDate: timestamp("transaction_date", {
      withTimezone: true,
    }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    matchedPaymentId: uuid("matched_payment_id").references(() => payments.id),
    isMatched: boolean("is_matched").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bank_tx_recon_id_idx").on(table.bankReconciliationId),
    index("bank_tx_matched_payment_id_idx").on(table.matchedPaymentId),
  ],
);

export type BankAccountRecord = InferSelectModel<typeof bankAccounts>;
export type NewBankAccountRecord = InferInsertModel<typeof bankAccounts>;
export type BankReconciliationRecord = InferSelectModel<
  typeof bankReconciliations
>;
export type NewBankReconciliationRecord = InferInsertModel<
  typeof bankReconciliations
>;
export type BankTransactionRecord = InferSelectModel<typeof bankTransactions>;
