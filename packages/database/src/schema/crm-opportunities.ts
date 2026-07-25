import {
  pgTable,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { crmLeads } from './crm-leads';
import { crmAccounts } from './crm-accounts';

export const crmOpportunities = pgTable(
  'crm_opportunities',
  {
    id: uuid('id').primaryKey(),
    opportunityNumber: varchar('opportunity_number', { length: 50 })
      .notNull()
      .unique(),
    name: varchar('name', { length: 255 }).notNull(),
    leadId: uuid('lead_id').references(() => crmLeads.id),
    crmAccountId: uuid('crm_account_id')
      .notNull()
      .references(() => crmAccounts.id),
    estimatedValue: numeric('estimated_value', {
      precision: 14,
      scale: 4,
    }).notNull(),
    expectedCloseDate: timestamp('expected_close_date', {
      withTimezone: true,
    }).notNull(),
    probability: numeric('probability', { precision: 5, scale: 2 })
      .notNull()
      .default('20.00'),
    stage: varchar('stage', { length: 50 }).notNull().default('PROSPECTING'),
    lostReason: text('lost_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('crm_opportunities_account_id_idx').on(table.crmAccountId),
    index('crm_opportunities_stage_idx').on(table.stage),
    index('crm_opportunities_lead_id_idx').on(table.leadId),
  ],
);

export type CrmOpportunityRecord = InferSelectModel<typeof crmOpportunities>;
export type NewCrmOpportunityRecord = InferInsertModel<typeof crmOpportunities>;
