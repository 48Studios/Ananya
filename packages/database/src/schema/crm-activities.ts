import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { crmLeads } from "./crm-leads";
import { crmAccounts } from "./crm-accounts";
import { crmOpportunities } from "./crm-opportunities";

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").primaryKey(),
    type: varchar("type", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    owner: varchar("owner", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("SCHEDULED"),
    relatedLeadId: uuid("related_lead_id").references(() => crmLeads.id),
    relatedAccountId: uuid("related_account_id").references(
      () => crmAccounts.id,
    ),
    relatedOpportunityId: uuid("related_opportunity_id").references(
      () => crmOpportunities.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crm_activities_type_idx").on(table.type),
    index("crm_activities_status_idx").on(table.status),
    index("crm_activities_owner_idx").on(table.owner),
    index("crm_activities_lead_id_idx").on(table.relatedLeadId),
    index("crm_activities_account_id_idx").on(table.relatedAccountId),
    index("crm_activities_opp_id_idx").on(table.relatedOpportunityId),
  ],
);

export type CrmActivityRecord = InferSelectModel<typeof crmActivities>;
export type NewCrmActivityRecord = InferInsertModel<typeof crmActivities>;
