import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { components } from "./components";

/**
 * Reusable attribute definition (e.g. Resistance, Capacitance, Package, Tolerance).
 * Data types supported: 'TEXT' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT' | 'QUANTITY' | 'DATE'.
 */
export const attributeDefinitions = pgTable(
  "attribute_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    code: varchar("code", { length: 100 }).notNull(),

    name: varchar("name", { length: 200 }).notNull(),

    description: varchar("description", { length: 1000 }),

    dataType: varchar("data_type", { length: 50 }).notNull(),

    unitCategory: varchar("unit_category", { length: 50 }),

    defaultUnit: varchar("default_unit", { length: 50 }),

    isFilterable: boolean("is_filterable").notNull().default(true),

    sortOrder: integer("sort_order").notNull().default(0),

    validationRules: jsonb("validation_rules"),

    aliases: jsonb("aliases").$type<string[]>().default([]),

    groupName: varchar("group_name", { length: 100 }),

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
    uniqueIndex("attribute_definitions_code_unique").on(table.code),
    index("attribute_definitions_data_type_idx").on(table.dataType),
    index("attribute_definitions_unit_category_idx").on(table.unitCategory),
    index("attribute_definitions_is_filterable_idx").on(table.isFilterable),
    index("attribute_definitions_group_name_idx").on(table.groupName),
  ],
);

export type AttributeDefinition = typeof attributeDefinitions.$inferSelect;
export type NewAttributeDefinition = typeof attributeDefinitions.$inferInsert;

/**
 * Predefined options for SELECT and MULTI_SELECT attributes (e.g. 0805, 0603, X7R, C0G).
 */
export const attributeOptions = pgTable(
  "attribute_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    attributeDefinitionId: uuid("attribute_definition_id")
      .notNull()
      .references(() => attributeDefinitions.id, {
        onDelete: "cascade",
      }),

    code: varchar("code", { length: 100 }).notNull(),

    label: varchar("label", { length: 200 }).notNull(),

    sortOrder: integer("sort_order").notNull().default(0),

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
    uniqueIndex("attribute_options_def_code_unique").on(
      table.attributeDefinitionId,
      table.code,
    ),
    index("attribute_options_def_id_idx").on(table.attributeDefinitionId),
    index("attribute_options_sort_order_idx").on(table.sortOrder),
  ],
);

export type AttributeOption = typeof attributeOptions.$inferSelect;
export type NewAttributeOption = typeof attributeOptions.$inferInsert;

/**
 * Category-Attribute association matrix, supporting hierarchical inheritance and overrides.
 */
export const categoryAttributes = pgTable(
  "category_attributes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, {
        onDelete: "cascade",
      }),

    attributeDefinitionId: uuid("attribute_definition_id")
      .notNull()
      .references(() => attributeDefinitions.id, {
        onDelete: "cascade",
      }),

    isRequired: boolean("is_required").notNull().default(false),

    sortOrder: integer("sort_order").notNull().default(0),

    defaultValue: jsonb("default_value"),

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
    uniqueIndex("category_attributes_cat_def_unique").on(
      table.categoryId,
      table.attributeDefinitionId,
    ),
    index("category_attributes_category_id_idx").on(table.categoryId),
    index("category_attributes_def_id_idx").on(table.attributeDefinitionId),
  ],
);

export type CategoryAttribute = typeof categoryAttributes.$inferSelect;
export type NewCategoryAttribute = typeof categoryAttributes.$inferInsert;

/**
 * Normalized typed storage for component attribute values.
 * Stores normalizedNumberValue in base unit (e.g. ohm, F, V, W, mm) to enable fast SQL B-Tree range queries.
 */
export const componentAttributeValues = pgTable(
  "component_attribute_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, {
        onDelete: "cascade",
      }),

    attributeDefinitionId: uuid("attribute_definition_id")
      .notNull()
      .references(() => attributeDefinitions.id, {
        onDelete: "cascade",
      }),

    textValue: varchar("text_value", { length: 1000 }),

    numberValue: numeric("number_value", { precision: 20, scale: 6 }),

    normalizedNumberValue: numeric("normalized_number_value", {
      precision: 24,
      scale: 8,
    }),

    booleanValue: boolean("boolean_value"),

    dateValue: timestamp("date_value", {
      withTimezone: true,
    }),

    unit: varchar("unit", { length: 50 }),

    optionId: uuid("option_id").references(() => attributeOptions.id, {
      onDelete: "set null",
    }),

    selectedOptionIds: jsonb("selected_option_ids"),

    jsonValue: jsonb("json_value"),

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
    uniqueIndex("component_attr_values_comp_def_unique").on(
      table.componentId,
      table.attributeDefinitionId,
    ),
    index("component_attr_values_comp_id_idx").on(table.componentId),
    index("component_attr_values_def_norm_num_idx").on(
      table.attributeDefinitionId,
      table.normalizedNumberValue,
    ),
    index("component_attr_values_def_num_idx").on(
      table.attributeDefinitionId,
      table.numberValue,
    ),
    index("component_attr_values_def_option_idx").on(
      table.attributeDefinitionId,
      table.optionId,
    ),
    index("component_attr_values_def_bool_idx").on(
      table.attributeDefinitionId,
      table.booleanValue,
    ),
    index("component_attr_values_def_text_idx").on(
      table.attributeDefinitionId,
      table.textValue,
    ),
  ],
);

export type ComponentAttributeValue =
  typeof componentAttributeValues.$inferSelect;
export type NewComponentAttributeValue =
  typeof componentAttributeValues.$inferInsert;
