import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { accounts } from "./accounts";

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey(),
    journalNumber: varchar("journal_number", { length: 50 }).notNull().unique(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    description: text("description").notNull(),
    reference: varchar("reference", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("journal_entries_status_idx").on(table.status),
    index("journal_entries_date_idx").on(table.date),
  ],
);

export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: uuid("id").primaryKey(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: numeric("debit", { precision: 14, scale: 4 }).notNull().default("0"),
    credit: numeric("credit", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("journal_entry_lines_entry_id_idx").on(table.journalEntryId),
    index("journal_entry_lines_account_id_idx").on(table.accountId),
  ],
);

export type JournalEntryRecord = InferSelectModel<typeof journalEntries>;
export type NewJournalEntryRecord = InferInsertModel<typeof journalEntries>;
export type JournalEntryLineRecord = InferSelectModel<typeof journalEntryLines>;
