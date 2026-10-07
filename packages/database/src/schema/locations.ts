import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    code: varchar("code", { length: 100 }).notNull(),

    name: varchar("name", { length: 200 }).notNull(),

    kind: varchar("kind", { length: 50 }).notNull(),

    parentId: uuid("parent_id").references((): AnyPgColumn => locations.id, {
      onDelete: "restrict",
    }),

    /**
     * Physical containment — RFC-0069 Phase 1 (schema only).
     *
     * `parentId` is the *organizational* hierarchy (navigation, breadcrumbs,
     * tree). `containerId` is the *physical* containment relation: what this
     * location is physically stored inside. The two are independent and neither
     * is derived from the other.
     *
     * Nullable and unpopulated by this migration. No application behaviour reads
     * or writes it yet; consumers switch to it in RFC-0069 Phase 4. Null means
     * "not physically contained as far as we know".
     */
    containerId: uuid("container_id").references(
      (): AnyPgColumn => locations.id,
      {
        onDelete: "restrict",
      },
    ),

    isActive: boolean("is_active").notNull().default(true),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

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
    uniqueIndex("locations_code_unique").on(table.code),
    index("locations_parent_id_idx").on(table.parentId),
    index("locations_container_id_idx").on(table.containerId),
    index("locations_kind_idx").on(table.kind),
  ],
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
