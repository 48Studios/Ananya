import {
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
  integer,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { locations } from "./locations";

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, {
        onDelete: "cascade",
      }),

    transactionType: varchar("transaction_type", { length: 50 }).notNull(),

    quantity: integer("quantity").notNull(),

    unitOfMeasure: varchar("unit_of_measure", { length: 50 }).notNull(),

    sourceLocationId: uuid("source_location_id").references(
      () => locations.id,
      {
        onDelete: "set null",
      },
    ),

    destinationLocationId: uuid("destination_location_id").references(
      () => locations.id,
      {
        onDelete: "set null",
      },
    ),

    reference: varchar("reference", { length: 200 }),

    reason: varchar("reason", { length: 1000 }),

    createdBy: varchar("created_by", { length: 100 }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_transactions_component_id_idx").on(table.componentId),
    index("inventory_transactions_source_location_id_idx").on(
      table.sourceLocationId,
    ),
    index("inventory_transactions_destination_location_id_idx").on(
      table.destinationLocationId,
    ),
    index("inventory_transactions_transaction_type_idx").on(
      table.transactionType,
    ),
    index("inventory_transactions_created_at_idx").on(table.createdAt),
  ],
);

export type InventoryTransactionRow = typeof inventoryTransactions.$inferSelect;
export type NewInventoryTransactionRow =
  typeof inventoryTransactions.$inferInsert;
