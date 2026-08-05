import { Lead, LeadStatus, LeadSource } from "./lead";

export interface FindManyLeadsOptions {
  status?: LeadStatus;
  source?: LeadSource;
  owner?: string;
  search?: string;
}

export interface LeadRepository {
  findById(id: string): Promise<Lead | null>;
  findByNumber(leadNumber: string): Promise<Lead | null>;
  findMany(options?: FindManyLeadsOptions): Promise<Lead[]>;
  save(lead: Lead): Promise<void>;
  generateNextLeadNumber(): Promise<string>;
}
