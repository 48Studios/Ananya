import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { customers } from "./customers";
import { salesOrders } from "./sales-orders";
import { projects } from "./projects";
import { components } from "./components";

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").primaryKey(),
    serviceNumber: varchar("service_number", { length: 50 }).notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id),
    projectId: uuid("project_id").references(() => projects.id),
    componentId: uuid("component_id").references(() => components.id),
    serialNumber: varchar("serial_number", { length: 100 }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    priority: varchar("priority", { length: 50 }).notNull().default("MEDIUM"),
    category: varchar("category", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("OPEN"),
    assignedTechnician: varchar("assigned_technician", { length: 100 }),
    diagnosticNotes: text("diagnostic_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("service_requests_customer_id_idx").on(table.customerId),
    index("service_requests_status_idx").on(table.status),
    index("service_requests_priority_idx").on(table.priority),
    index("service_requests_category_idx").on(table.category),
    index("service_requests_technician_idx").on(table.assignedTechnician),
  ],
);

export const serviceWorkOrders = pgTable(
  "service_work_orders",
  {
    id: uuid("id").primaryKey(),
    workOrderNumber: varchar("work_order_number", { length: 50 })
      .notNull()
      .unique(),
    serviceRequestId: uuid("service_request_id")
      .notNull()
      .references(() => serviceRequests.id, { onDelete: "cascade" }),
    assignedTechnician: varchar("assigned_technician", { length: 100 }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    plannedHours: numeric("planned_hours", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    actualHours: numeric("actual_hours", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    priority: varchar("priority", { length: 50 }).notNull().default("MEDIUM"),
    status: varchar("status", { length: 50 }).notNull().default("CREATED"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("service_work_orders_service_request_id_idx").on(
      table.serviceRequestId,
    ),
    index("service_work_orders_technician_idx").on(table.assignedTechnician),
    index("service_work_orders_status_idx").on(table.status),
  ],
);

export const warrantyClaims = pgTable(
  "warranty_claims",
  {
    id: uuid("id").primaryKey(),
    warrantyNumber: varchar("warranty_number", { length: 50 })
      .notNull()
      .unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => components.id),
    serialNumber: varchar("serial_number", { length: 100 }),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull(),
    expiryDate: timestamp("expiry_date", { withTimezone: true }).notNull(),
    claimReason: text("claim_reason").notNull(),
    decision: varchar("decision", { length: 50 })
      .notNull()
      .default("SUBMITTED"),
    decisionNotes: text("decision_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("warranty_claims_customer_id_idx").on(table.customerId),
    index("warranty_claims_product_id_idx").on(table.productId),
    index("warranty_claims_decision_idx").on(table.decision),
  ],
);

export const rmaRequests = pgTable(
  "rma_requests",
  {
    id: uuid("id").primaryKey(),
    rmaNumber: varchar("rma_number", { length: 50 }).notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id),
    itemDescription: varchar("item_description", { length: 255 }).notNull(),
    serialNumber: varchar("serial_number", { length: 100 }),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("REQUESTED"),
    disposition: varchar("disposition", { length: 50 }),
    inspectionNotes: text("inspection_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rma_requests_customer_id_idx").on(table.customerId),
    index("rma_requests_sales_order_id_idx").on(table.salesOrderId),
    index("rma_requests_status_idx").on(table.status),
    index("rma_requests_disposition_idx").on(table.disposition),
  ],
);

export const maintenanceSchedules = pgTable(
  "maintenance_schedules",
  {
    id: uuid("id").primaryKey(),
    scheduleNumber: varchar("schedule_number", { length: 50 })
      .notNull()
      .unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    assetName: varchar("asset_name", { length: 255 }).notNull(),
    serialNumber: varchar("serial_number", { length: 100 }),
    frequency: varchar("frequency", { length: 50 }).notNull(),
    nextVisitDate: timestamp("next_visit_date", {
      withTimezone: true,
    }).notNull(),
    assignedTechnician: varchar("assigned_technician", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("maintenance_schedules_customer_id_idx").on(table.customerId),
    index("maintenance_schedules_technician_idx").on(table.assignedTechnician),
    index("maintenance_schedules_status_idx").on(table.status),
  ],
);

export const serviceNotes = pgTable(
  "service_notes",
  {
    id: uuid("id").primaryKey(),
    serviceRequestId: uuid("service_request_id").references(
      () => serviceRequests.id,
      { onDelete: "cascade" },
    ),
    workOrderId: uuid("work_order_id").references(() => serviceWorkOrders.id, {
      onDelete: "cascade",
    }),
    warrantyClaimId: uuid("warranty_claim_id").references(
      () => warrantyClaims.id,
      { onDelete: "cascade" },
    ),
    author: varchar("author", { length: 100 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("service_notes_service_request_id_idx").on(table.serviceRequestId),
    index("service_notes_work_order_id_idx").on(table.workOrderId),
    index("service_notes_warranty_claim_id_idx").on(table.warrantyClaimId),
  ],
);

export type ServiceRequestRecord = InferSelectModel<typeof serviceRequests>;
export type NewServiceRequestRecord = InferInsertModel<typeof serviceRequests>;

export type ServiceWorkOrderRecord = InferSelectModel<typeof serviceWorkOrders>;
export type NewServiceWorkOrderRecord = InferInsertModel<
  typeof serviceWorkOrders
>;

export type WarrantyClaimRecord = InferSelectModel<typeof warrantyClaims>;
export type NewWarrantyClaimRecord = InferInsertModel<typeof warrantyClaims>;

export type RmaRequestRecord = InferSelectModel<typeof rmaRequests>;
export type NewRmaRequestRecord = InferInsertModel<typeof rmaRequests>;

export type MaintenanceScheduleRecord = InferSelectModel<
  typeof maintenanceSchedules
>;
export type NewMaintenanceScheduleRecord = InferInsertModel<
  typeof maintenanceSchedules
>;

export type ServiceNoteRecord = InferSelectModel<typeof serviceNotes>;
export type NewServiceNoteRecord = InferInsertModel<typeof serviceNotes>;
