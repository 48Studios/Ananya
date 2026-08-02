import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const userDashboardLayouts = pgTable(
  "user_dashboard_layouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    widgetsJson: jsonb("widgets_json").$type<
      Array<{ id: string; title: string; enabled: boolean; width: 'full' | 'half' }>
    >().default([
      { id: "stats-summary", title: "Key Metrics", enabled: true, width: "full" },
      { id: "low-stock", title: "Low Stock Inventory", enabled: true, width: "half" },
      { id: "recent-pos", title: "Recent Purchase Orders", enabled: true, width: "half" },
      { id: "activity-feed", title: "Operational Activity Feed", enabled: true, width: "half" },
      { id: "favorite-records", title: "Pinned & Favorites", enabled: true, width: "half" },
    ]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_dashboard_layouts_user_id_idx").on(table.userId)]
);

export const userSavedViews = pgTable(
  "user_saved_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    filtersJson: jsonb("filters_json").$type<Record<string, unknown>>().default({}),
    sortJson: jsonb("sort_json").$type<{ field: string; direction: 'asc' | 'desc' }>().default({ field: "createdAt", direction: "desc" }),
    columnsJson: jsonb("columns_json").$type<string[]>().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("user_saved_views_user_id_idx").on(table.userId),
    index("user_saved_views_module_idx").on(table.module),
  ]
);

export const userFavorites = pgTable(
  "user_favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 64 }).notNull(), // 'Component' | 'Project' | 'PurchaseOrder'
    entityId: varchar("entity_id", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    href: varchar("href", { length: 512 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_favorites_user_id_idx").on(table.userId)]
);

export const userWorkspacePreferences = pgTable(
  "user_workspace_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultLandingPage: varchar("default_landing_page", { length: 255 }).notNull().default("/dashboard"),
    tableDensity: varchar("table_density", { length: 32 }).notNull().default("compact"), // 'compact' | 'comfortable'
    themePreference: varchar("theme_preference", { length: 32 }).notNull().default("system"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_workspace_preferences_user_id_idx").on(table.userId)]
);

export type UserDashboardLayoutRecord = typeof userDashboardLayouts.$inferSelect;
export type UserSavedViewRecord = typeof userSavedViews.$inferSelect;
export type UserFavoriteRecord = typeof userFavorites.$inferSelect;
export type UserWorkspacePreferenceRecord = typeof userWorkspacePreferences.$inferSelect;
