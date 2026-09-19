import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";

export const components = pgTable(
  "components",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    sku: varchar("sku", { length: 100 }).notNull(),

    manufacturerPartNumber: varchar("manufacturer_part_number", {
      length: 128,
    }),

    name: varchar("name", { length: 200 }).notNull(),

    description: varchar("description", { length: 1000 }),

    manufacturerId: uuid("manufacturer_id"),

    categoryId: uuid("category_id"),

    defaultLocationId: uuid("default_location_id").references(
      () => locations.id,
      {
        onDelete: "set null",
      },
    ),

    unit: varchar("unit", { length: 50 }).notNull(),

    isActive: boolean("is_active").notNull().default(true),

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
    uniqueIndex("components_sku_unique").on(table.sku),
    index("components_manufacturer_id_idx").on(table.manufacturerId),
    index("components_category_id_idx").on(table.categoryId),
    index("components_default_location_id_idx").on(table.defaultLocationId),
    index("components_unit_idx").on(table.unit),
  ],
);

export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
