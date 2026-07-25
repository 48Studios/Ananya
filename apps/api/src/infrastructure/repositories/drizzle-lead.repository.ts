import { db } from '@ananya/database';
import { crmLeads } from '@ananya/database/schema';
import { eq, desc, count, ilike, or } from '@ananya/database/query';
import type { CrmLeadRecord } from '@ananya/database/schema';
import {
  Lead,
  type LeadRepository,
  type LeadStatus,
  type LeadSource,
  type FindManyLeadsOptions,
} from '@ananya/crm';

function toDomain(row: CrmLeadRecord): Lead {
  return Lead.rehydrate({
    id: row.id,
    leadNumber: row.leadNumber,
    name: row.name,
    company: row.company,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    source: row.source as LeadSource,
    industry: row.industry ?? undefined,
    owner: row.owner,
    status: row.status as LeadStatus,
    disqualificationReason: row.disqualificationReason ?? undefined,
    convertedAccountId: row.convertedAccountId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleLeadRepository implements LeadRepository {
  async findById(id: string): Promise<Lead | null> {
    const [row] = await db
      .select()
      .from(crmLeads)
      .where(eq(crmLeads.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(leadNumber: string): Promise<Lead | null> {
    const [row] = await db
      .select()
      .from(crmLeads)
      .where(eq(crmLeads.leadNumber, leadNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyLeadsOptions): Promise<Lead[]> {
    const query = db.select().from(crmLeads);
    if (options?.status) {
      query.where(eq(crmLeads.status, options.status));
    }
    if (options?.source) {
      query.where(eq(crmLeads.source, options.source));
    }
    if (options?.owner) {
      query.where(eq(crmLeads.owner, options.owner));
    }
    if (options?.search) {
      const term = `%${options.search}%`;
      query.where(
        or(
          ilike(crmLeads.name, term),
          ilike(crmLeads.company, term),
          ilike(crmLeads.leadNumber, term),
        ),
      );
    }
    const rows = await query.orderBy(desc(crmLeads.createdAt));
    return rows.map(toDomain);
  }

  async save(lead: Lead): Promise<void> {
    await db
      .insert(crmLeads)
      .values({
        id: lead.id,
        leadNumber: lead.leadNumber,
        name: lead.name,
        company: lead.company,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        source: lead.source,
        industry: lead.industry ?? null,
        owner: lead.owner,
        status: lead.status,
        disqualificationReason: lead.disqualificationReason ?? null,
        convertedAccountId: lead.convertedAccountId ?? null,
      })
      .onConflictDoUpdate({
        target: crmLeads.id,
        set: {
          name: lead.name,
          company: lead.company,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          source: lead.source,
          industry: lead.industry ?? null,
          owner: lead.owner,
          status: lead.status,
          disqualificationReason: lead.disqualificationReason ?? null,
          convertedAccountId: lead.convertedAccountId ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextLeadNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(crmLeads);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `LEAD-${year}-${num}`;
  }
}
