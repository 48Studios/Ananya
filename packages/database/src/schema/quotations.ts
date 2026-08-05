import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { customers } from "./customers";
import { components } from "./components";

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey(),
    quoteNumber: varchar("quote_number", { length: 50 }).notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quotations_customer_id_idx").on(table.customerId),
    index("quotations_status_idx").on(table.status),
  ],
);

export const quotationLines = pgTable(
  "quotation_lines",
  {
    id: uuid("id").primaryKey(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull(),
    discount: numeric("discount", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    totalPrice: numeric("total_price", { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quotation_lines_quotation_id_idx").on(table.quotationId),
    index("quotation_lines_component_id_idx").on(table.componentId),
  ],
);

export type QuotationRecord = InferSelectModel<typeof quotations>;
export type NewQuotationRecord = InferInsertModel<typeof quotations>;
export type QuotationLineRecord = InferSelectModel<typeof quotationLines>;
