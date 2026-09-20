import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";
import { consolidations } from "./consolidations";

/**
 * Component master data.
 *
 * Lifecycle (Pass 6B): a component is either ACTIVE or CONSOLIDATED.
 *
 *  - ACTIVE:       `is_active = true`,  `consolidated_into_component_id = null`
 *  - CONSOLIDATED: `is_active = false`, `consolidated_into_component_id = <canonical>`
 *
 * A consolidated component is never hard-deleted: it stays queryable, stays
 * historically identifiable, and keeps every foreign key that references it.
 * It is only excluded from "selectable active components" queries, may not
 * receive new inventory transactions, and may not have its master data edited.
 */
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

    /**
     * The canonical component this record was consolidated into. `RESTRICT` on
     * delete because a canonical component that absorbed others must not be
     * removable while the retirement trail points at it.
     */
    consolidatedIntoComponentId: uuid("consolidated_into_component_id").references(
      (): AnyPgColumn => components.id,
      { onDelete: "restrict" },
    ),

    /**
     * The consolidation operation that retired this component.
     */
    consolidationId: uuid("consolidation_id").references(
      (): AnyPgColumn => consolidations.id,
      { onDelete: "restrict" },
    ),

    consolidatedAt: timestamp("consolidated_at", { withTimezone: true }),

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
    /**
     * "Selectable active components" queries filter out consolidated records;
     * this index keeps that exclusion cheap.
     */
    index("components_consolidated_into_component_id_idx").on(
      table.consolidatedIntoComponentId,
    ),
    index("components_consolidation_id_idx").on(table.consolidationId),
    /**
     * Deterministic duplicate candidate retrieval groups the catalog by
     * normalized manufacturer part number (`upper(regexp_replace(mpn, ...))`),
     * mirroring `normalizeMpn` in the API's duplicate intelligence module.
     * Partial because rows without an MPN can never be MPN candidates.
     */
    index("components_mpn_normalized_idx")
      .using(
        "btree",
        sql`upper(regexp_replace(${table.manufacturerPartNumber}, '[^A-Za-z0-9]', '', 'g'))`,
      )
      .where(sql`${table.manufacturerPartNumber} is not null`),
    /**
     * Name-identity candidate retrieval groups the catalog by normalized name
     * (`regexp_replace(replace(lower(name), ...))`), mirroring
     * `normalizeComponentName` in the API's duplicate intelligence module.
     */
    index("components_name_normalized_idx").using(
      "btree",
      sql`regexp_replace(replace(replace(replace(lower(replace(replace(${table.name}, 'Ω', 'ohm'), 'ω', 'ohm')), 'µ', 'u'), 'μ', 'u'), '°c', 'degc'), '[^a-z0-9]', '', 'g')`,
    ),
  ],
);

export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
