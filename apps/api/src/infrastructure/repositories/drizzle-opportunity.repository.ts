import { db } from '@ananya/database';
import { crmOpportunities } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { CrmOpportunityRecord } from '@ananya/database/schema';
import {
  Opportunity,
  type OpportunityRepository,
  type OpportunityStage,
  type FindManyOpportunitiesOptions,
} from '@ananya/crm';

function toDomain(row: CrmOpportunityRecord): Opportunity {
  return Opportunity.rehydrate({
    id: row.id,
    opportunityNumber: row.opportunityNumber,
    name: row.name,
    leadId: row.leadId ?? undefined,
    crmAccountId: row.crmAccountId,
    estimatedValue: parseFloat(row.estimatedValue),
    expectedCloseDate: row.expectedCloseDate,
    probability: parseFloat(row.probability),
    stage: row.stage as OpportunityStage,
    lostReason: row.lostReason ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleOpportunityRepository implements OpportunityRepository {
  async findById(id: string): Promise<Opportunity | null> {
    const [row] = await db
      .select()
      .from(crmOpportunities)
      .where(eq(crmOpportunities.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(opportunityNumber: string): Promise<Opportunity | null> {
    const [row] = await db
      .select()
      .from(crmOpportunities)
      .where(
        eq(crmOpportunities.opportunityNumber, opportunityNumber.toUpperCase()),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyOpportunitiesOptions,
  ): Promise<Opportunity[]> {
    const query = db.select().from(crmOpportunities);
    if (options?.crmAccountId) {
      query.where(eq(crmOpportunities.crmAccountId, options.crmAccountId));
    }
    if (options?.stage) {
      query.where(eq(crmOpportunities.stage, options.stage));
    }
    if (options?.search) {
      query.where(ilike(crmOpportunities.name, `%${options.search}%`));
    }
    const rows = await query.orderBy(desc(crmOpportunities.createdAt));
    return rows.map(toDomain);
  }

  async save(opportunity: Opportunity): Promise<void> {
    await db
      .insert(crmOpportunities)
      .values({
        id: opportunity.id,
        opportunityNumber: opportunity.opportunityNumber,
        name: opportunity.name,
        leadId: opportunity.leadId ?? null,
        crmAccountId: opportunity.crmAccountId,
        estimatedValue: opportunity.estimatedValue.toString(),
        expectedCloseDate: opportunity.expectedCloseDate,
        probability: opportunity.probability.toString(),
        stage: opportunity.stage,
        lostReason: opportunity.lostReason ?? null,
      })
      .onConflictDoUpdate({
        target: crmOpportunities.id,
        set: {
          name: opportunity.name,
          estimatedValue: opportunity.estimatedValue.toString(),
          expectedCloseDate: opportunity.expectedCloseDate,
          probability: opportunity.probability.toString(),
          stage: opportunity.stage,
          lostReason: opportunity.lostReason ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextOpportunityNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(crmOpportunities);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `OPP-${year}-${num}`;
  }
}
