import {
  boolean,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", { length: 100 }).notNull(),

    category: varchar("category", { length: 50 }).notNull(),

    isBaseUnit: boolean("is_base_unit").notNull().default(false),

    conversionFactor: numeric("conversion_factor", { precision: 28, scale: 12 }),

    precision: numeric("precision", { precision: 10, scale: 0 })
      .notNull()
      .default("0"),

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
    uniqueIndex("units_name_unique").on(table.name),
    index("units_category_idx").on(table.category),
    index("units_is_base_unit_idx").on(table.isBaseUnit),
  ],
);

export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
