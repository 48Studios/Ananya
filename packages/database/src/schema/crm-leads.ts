import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const crmLeads = pgTable(
  "crm_leads",
  {
    id: uuid("id").primaryKey(),
    leadNumber: varchar("lead_number", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    source: varchar("source", { length: 50 }).notNull().default("WEBSITE"),
    industry: varchar("industry", { length: 100 }),
    owner: varchar("owner", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("NEW"),
    disqualificationReason: text("disqualification_reason"),
    convertedAccountId: uuid("converted_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crm_leads_status_idx").on(table.status),
    index("crm_leads_owner_idx").on(table.owner),
    index("crm_leads_source_idx").on(table.source),
  ],
);

export type CrmLeadRecord = InferSelectModel<typeof crmLeads>;
export type NewCrmLeadRecord = InferInsertModel<typeof crmLeads>;
