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

    /**
     * Multiplicative scale between this unit and its category's base unit.
     *
     * 18 decimal places rather than 12: an affine unit's factor can be a
     * repeating decimal (`°F` is 5/9 of a `°C` step), and truncating it makes an
     * exact conversion inexact — `50 °F` would convert to `10.000000000008 °C`
     * and stop comparing equal to `10 °C`.
     */
    conversionFactor: numeric("conversion_factor", { precision: 28, scale: 18 }),

    /**
     * Zero-point shift, applied **before** the factor:
     * `base = (value + conversionOffset) × conversionFactor`.
     *
     * A multiplicative unit leaves this null (equivalent to 0). An affine unit
     * — one whose zero is not the base unit's zero — needs it, and this
     * convention keeps the stored number exact: `°F` is `(value − 32) × 5/9`,
     * so its offset is the whole number −32 rather than the repeating
     * −17.777… a `value × factor + offset` form would require.
     */
    conversionOffset: numeric("conversion_offset", {
      precision: 28,
      scale: 18,
    }),

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
