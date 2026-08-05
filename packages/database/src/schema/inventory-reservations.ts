import {
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { locations } from "./locations";

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationNumber: varchar("reservation_number", { length: 64 }).notNull(),
    reservationType: varchar("reservation_type", { length: 32 })
      .notNull()
      .default("WORK_ORDER"),
    referenceDocument: varchar("reference_document", { length: 128 }),
    reservedBy: varchar("reserved_by", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("inventory_reservations_number_unique").on(
      table.reservationNumber,
    ),
    index("inventory_reservations_status_idx").on(table.status),
    index("inventory_reservations_type_idx").on(table.reservationType),
  ],
);

export const inventoryReservationLines = pgTable(
  "inventory_reservation_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => inventoryReservations.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    reservedQuantity: decimal("reserved_quantity", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    fulfilledQuantity: decimal("fulfilled_quantity", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0.0000"),
    unitOfMeasure: varchar("unit_of_measure", { length: 32 })
      .notNull()
      .default("pcs"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_reservation_lines_reservation_id_idx").on(
      table.reservationId,
    ),
    index("inventory_reservation_lines_component_id_idx").on(table.componentId),
    index("inventory_reservation_lines_location_id_idx").on(table.locationId),
  ],
);

export type InventoryReservationRecord =
  typeof inventoryReservations.$inferSelect;
export type NewInventoryReservationRecord =
  typeof inventoryReservations.$inferInsert;
export type InventoryReservationLineRecord =
  typeof inventoryReservationLines.$inferSelect;
export type NewInventoryReservationLineRecord =
  typeof inventoryReservationLines.$inferInsert;
