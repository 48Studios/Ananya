import {
  boolean,
  decimal,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const procurementPolicies = pgTable(
  "procurement_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    policyType: varchar("policy_type", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    thresholdAmount: decimal("threshold_amount", {
      precision: 14,
      scale: 4,
    }).default("0.0000"),
    overReceiptTolerancePercent: decimal("over_receipt_tolerance_percent", {
      precision: 5,
      scale: 2,
    }).default("0.00"),
    requiresExecutiveApproval: boolean("requires_executive_approval").default(
      false,
    ),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("procurement_policies_type_idx").on(table.policyType),
    index("procurement_policies_is_active_idx").on(table.isActive),
  ],
);

export type ProcurementPolicyRecord = typeof procurementPolicies.$inferSelect;
export type NewProcurementPolicyRecord =
  typeof procurementPolicies.$inferInsert;
