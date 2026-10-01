import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";

/**
 * 1. Spatial Models (Reusable 3D/2D Geometry Definitions)
 *
 * Represents an asset/geometry template (e.g., SMD cabinet, rack, tray)
 * that can be reused across any number of physical storage locations.
 * Decoupled from specific warehouse locations and completely isolated from inventory balances.
 */
export const spatialModels = pgTable(
  "spatial_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    format: varchar("format", { length: 32 }).notNull().default("GLB"), // GLB, GLTF, SVG, PROCEDURAL
    assetUri: varchar("asset_uri", { length: 512 }),
    thumbnailUri: varchar("thumbnail_uri", { length: 512 }),
    widthMm: numeric("width_mm", { precision: 10, scale: 2 }).notNull(),
    heightMm: numeric("height_mm", { precision: 10, scale: 2 }).notNull(),
    depthMm: numeric("depth_mm", { precision: 10, scale: 2 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("spatial_models_code_unique").on(table.code),
    index("spatial_models_format_idx").on(table.format),
    index("spatial_models_is_active_idx").on(table.isActive),
  ],
);

/**
 * 2. Spatial Anchors (Sub-compartments / reference points within a model)
 *
 * Describes a named physical compartment (e.g., Drawer A1, Shelf Bay 3)
 * defined in model-local coordinates relative to its parent SpatialModel's origin.
 */
export const spatialAnchors = pgTable(
  "spatial_anchors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => spatialModels.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(), // e.g. "DRAWER-A1", "BIN-04"
    name: varchar("name", { length: 128 }).notNull(),
    anchorType: varchar("anchor_type", { length: 32 }).notNull().default("BIN"), // BIN, DRAWER, SHELF, MOUNT, ACCESS
    // Local position relative to model origin (in millimeters)
    localPositionX: numeric("local_position_x", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    localPositionY: numeric("local_position_y", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    localPositionZ: numeric("local_position_z", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    // Local rotation relative to model origin (in degrees)
    localRotationX: numeric("local_rotation_x", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    localRotationY: numeric("local_rotation_y", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    localRotationZ: numeric("local_rotation_z", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    boundingWidthMm: numeric("bounding_width_mm", { precision: 10, scale: 2 }),
    boundingHeightMm: numeric("bounding_height_mm", { precision: 10, scale: 2 }),
    boundingDepthMm: numeric("bounding_depth_mm", { precision: 10, scale: 2 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("spatial_anchors_model_code_unique").on(
      table.modelId,
      table.code,
    ),
    index("spatial_anchors_model_id_idx").on(table.modelId),
  ],
);

/**
 * 3. Spatial Nodes (Physical occurrence mapped to Location)
 *
 * Placed spatial instance maintaining parent-relative coordinates and orientation.
 * Exactly one SpatialNode per Location (1:0..1).
 * All linear positions are in millimeters. Rotations in degrees. Scale is dimensionless.
 * Deleting a spatial node never deletes a Location or inventory truth.
 * Deleting an authorized Location cascadingly cleans up its spatial representation.
 */
export const spatialNodes = pgTable(
  "spatial_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    modelId: uuid("model_id").references(() => spatialModels.id, {
      onDelete: "restrict",
    }),
    parentSpatialNodeId: uuid("parent_spatial_node_id").references(
      (): AnyPgColumn => spatialNodes.id,
      { onDelete: "set null" },
    ),
    anchorId: uuid("anchor_id").references(() => spatialAnchors.id, {
      onDelete: "set null",
    }),

    // Position relative to parent spatial node (or world origin if root) in millimeters
    positionX: numeric("position_x", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    positionY: numeric("position_y", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    positionZ: numeric("position_z", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),

    // Euler rotation relative to parent spatial node (in degrees)
    rotationX: numeric("rotation_x", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    rotationY: numeric("rotation_y", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    rotationZ: numeric("rotation_z", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),

    // Scale factors (dimensionless multiplier, defaults to 1.0)
    scaleX: numeric("scale_x", { precision: 6, scale: 4 })
      .notNull()
      .default("1.0000"),
    scaleY: numeric("scale_y", { precision: 6, scale: 4 })
      .notNull()
      .default("1.0000"),
    scaleZ: numeric("scale_z", { precision: 6, scale: 4 })
      .notNull()
      .default("1.0000"),

    isVisible: boolean("is_visible").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("spatial_nodes_location_id_unique").on(table.locationId),
    index("spatial_nodes_model_id_idx").on(table.modelId),
    index("spatial_nodes_parent_id_idx").on(table.parentSpatialNodeId),
    index("spatial_nodes_anchor_id_idx").on(table.anchorId),
  ],
);

export type SpatialModelRecord = typeof spatialModels.$inferSelect;
export type NewSpatialModelRecord = typeof spatialModels.$inferInsert;
export type SpatialAnchorRecord = typeof spatialAnchors.$inferSelect;
export type NewSpatialAnchorRecord = typeof spatialAnchors.$inferInsert;
export type SpatialNodeRecord = typeof spatialNodes.$inferSelect;
export type NewSpatialNodeRecord = typeof spatialNodes.$inferInsert;
