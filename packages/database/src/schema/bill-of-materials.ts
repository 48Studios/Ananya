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

export const billOfMaterials = pgTable(
  "bill_of_materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    revision: varchar("revision", { length: 32 }).notNull().default("v1.0"),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    notes: text("notes"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bill_of_materials_component_id_idx").on(table.componentId),
    index("bill_of_materials_status_idx").on(table.status),
  ],
);

export const billOfMaterialLines = pgTable(
  "bill_of_material_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => billOfMaterials.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    quantityPerUnit: decimal("quantity_per_unit", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("1.0000"),
    unitOfMeasure: varchar("unit_of_measure", { length: 32 })
      .notNull()
      .default("pcs"),
    scrapFactorPercent: decimal("scrap_factor_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0.00"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bill_of_material_lines_bom_id_idx").on(table.bomId),
    index("bill_of_material_lines_component_id_idx").on(table.componentId),
  ],
);

export type BillOfMaterialsRecord = typeof billOfMaterials.$inferSelect;
export type NewBillOfMaterialsRecord = typeof billOfMaterials.$inferInsert;
export type BillOfMaterialLineRecord = typeof billOfMaterialLines.$inferSelect;
export type NewBillOfMaterialLineRecord =
  typeof billOfMaterialLines.$inferInsert;
