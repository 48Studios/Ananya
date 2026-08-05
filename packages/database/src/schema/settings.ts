import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const organizationProfile = pgTable("organization_profile", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyName: varchar("company_name", { length: 255 })
    .notNull()
    .default("48 Studios"),
  legalName: varchar("legal_name", { length: 255 })
    .notNull()
    .default("48 Studios Pvt Ltd"),
  registrationNumber: varchar("registration_number", { length: 128 }),
  taxId: varchar("tax_id", { length: 128 })
    .notNull()
    .default("GSTIN-33AAACD4848A1Z5"),
  email: varchar("email", { length: 255 })
    .notNull()
    .default("ops@48studios.com"),
  phone: varchar("phone", { length: 64 }).notNull().default("+91 44 2848 4848"),
  website: varchar("website", { length: 255 }).default("https://48studios.com"),
  address: text("address").default("48 Enterprise Way, Tech Park"),
  city: varchar("city", { length: 128 }).default("Chennai"),
  state: varchar("state", { length: 128 }).default("Tamil Nadu"),
  country: varchar("country", { length: 128 }).default("India"),
  postalCode: varchar("postal_code", { length: 32 }).default("600001"),
  primaryTimezone: varchar("primary_timezone", { length: 64 }).default(
    "Asia/Kolkata",
  ),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseCurrency: varchar("base_currency", { length: 8 })
    .notNull()
    .default("INR"),
  supportedCurrencies: jsonb("supported_currencies")
    .$type<string[]>()
    .default(["INR", "USD", "EUR"]),
  defaultWarehouseId: uuid("default_warehouse_id"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(4), // April
  dateFormat: varchar("date_format", { length: 32 })
    .notNull()
    .default("YYYY-MM-DD"),
  reorderDefaultsJson: jsonb("reorder_defaults_json")
    .$type<Record<string, number>>()
    .default({
      minStockLevel: 10,
      reorderQuantity: 50,
    }),
  taxRatesJson: jsonb("tax_rates_json")
    .$type<Array<{ name: string; rate: number }>>()
    .default([
      { name: "GST 18%", rate: 18 },
      { name: "GST 12%", rate: 12 },
      { name: "GST 5%", rate: 5 },
    ]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const numberingSeries = pgTable(
  "numbering_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 64 }).notNull().unique(), // 'PurchaseOrder' | 'WorkOrder' | 'Component'
    prefix: varchar("prefix", { length: 32 }).notNull(),
    dateFormat: varchar("date_format", { length: 32 }).default("YYYY"),
    nextSequenceNumber: integer("next_sequence_number").notNull().default(1),
    zeroPadLength: integer("zero_pad_length").notNull().default(6),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("numbering_series_entity_type_idx").on(table.entityType)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 64 })
      .notNull()
      .default("EXPERIMENTAL"),
    isEnabled: boolean("is_enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("feature_flags_key_idx").on(table.key)],
);

export type OrganizationProfileRecord = typeof organizationProfile.$inferSelect;
export type SystemSettingsRecord = typeof systemSettings.$inferSelect;
export type NumberingSeriesRecord = typeof numberingSeries.$inferSelect;
export type FeatureFlagRecord = typeof featureFlags.$inferSelect;
