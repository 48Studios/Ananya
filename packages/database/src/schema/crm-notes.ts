import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { crmLeads } from './crm-leads';
import { crmAccounts } from './crm-accounts';
import { crmOpportunities } from './crm-opportunities';
import { crmActivities } from './crm-activities';

export const crmNotes = pgTable(
  'crm_notes',
  {
    id: uuid('id').primaryKey(),
    author: varchar('author', { length: 100 }).notNull(),
    body: text('body').notNull(),
    leadId: uuid('lead_id').references(() => crmLeads.id, {
      onDelete: 'cascade',
    }),
    crmAccountId: uuid('crm_account_id').references(() => crmAccounts.id, {
      onDelete: 'cascade',
    }),
    opportunityId: uuid('opportunity_id').references(
      () => crmOpportunities.id,
      { onDelete: 'cascade' },
    ),
    activityId: uuid('activity_id').references(() => crmActivities.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('crm_notes_lead_id_idx').on(table.leadId),
    index('crm_notes_account_id_idx').on(table.crmAccountId),
    index('crm_notes_opp_id_idx').on(table.opportunityId),
    index('crm_notes_activity_id_idx').on(table.activityId),
  ],
);

export type CrmNoteRecord = InferSelectModel<typeof crmNotes>;
export type NewCrmNoteRecord = InferInsertModel<typeof crmNotes>;
