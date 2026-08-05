import { Opportunity, OpportunityStage } from "./opportunity";

export interface FindManyOpportunitiesOptions {
  crmAccountId?: string;
  stage?: OpportunityStage;
  search?: string;
}

export interface OpportunityRepository {
  findById(id: string): Promise<Opportunity | null>;
  findByNumber(opportunityNumber: string): Promise<Opportunity | null>;
  findMany(options?: FindManyOpportunitiesOptions): Promise<Opportunity[]>;
  save(opportunity: Opportunity): Promise<void>;
  generateNextOpportunityNumber(): Promise<string>;
}
