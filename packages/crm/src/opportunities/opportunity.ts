import { ObjectId } from "@ananya/core";

export type OpportunityStage =
  "PROSPECTING" | "QUALIFICATION" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

export interface OpportunityProps {
  id: string;
  opportunityNumber: string;
  name: string;
  leadId?: string;
  crmAccountId: string;
  estimatedValue: number;
  expectedCloseDate: Date;
  probability: number;
  stage: OpportunityStage;
  lostReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOpportunityProps {
  opportunityNumber: string;
  name: string;
  leadId?: string;
  crmAccountId: string;
  estimatedValue: number;
  expectedCloseDate: Date;
  probability?: number;
}

export class Opportunity implements OpportunityProps {
  public readonly id: string;
  public opportunityNumber: string;
  public name: string;
  public leadId?: string;
  public crmAccountId: string;
  public estimatedValue: number;
  public expectedCloseDate: Date;
  public probability: number;
  public stage: OpportunityStage;
  public lostReason?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: OpportunityProps) {
    this.id = props.id;
    this.opportunityNumber = props.opportunityNumber;
    this.name = props.name;
    this.leadId = props.leadId;
    this.crmAccountId = props.crmAccountId;
    this.estimatedValue = props.estimatedValue;
    this.expectedCloseDate = props.expectedCloseDate;
    this.probability = props.probability;
    this.stage = props.stage;
    this.lostReason = props.lostReason;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateOpportunityProps): Opportunity {
    if (!props.name || props.name.trim() === "") {
      throw new Error("Opportunity name is required");
    }
    if (!props.crmAccountId || props.crmAccountId.trim() === "") {
      throw new Error("Opportunity requires a valid CRM Account ID");
    }
    if (props.estimatedValue < 0) {
      throw new Error("Estimated value cannot be negative");
    }

    const now = new Date();
    return new Opportunity({
      id: ObjectId.generate().value,
      opportunityNumber: props.opportunityNumber,
      name: props.name.trim(),
      leadId: props.leadId,
      crmAccountId: props.crmAccountId,
      estimatedValue: props.estimatedValue,
      expectedCloseDate: props.expectedCloseDate,
      probability: props.probability ?? 20,
      stage: "PROSPECTING",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: OpportunityProps): Opportunity {
    return new Opportunity(props);
  }

  public advanceStage(nextStage: OpportunityStage): void {
    if (this.stage === "WON" || this.stage === "LOST") {
      throw new Error(
        `Closed opportunities in stage ${this.stage} cannot advance stage`,
      );
    }
    this.stage = nextStage;
    if (nextStage === "QUALIFICATION") this.probability = 40;
    if (nextStage === "PROPOSAL") this.probability = 60;
    if (nextStage === "NEGOTIATION") this.probability = 80;
    this.updatedAt = new Date();
  }

  public closeWon(): void {
    if (this.stage === "LOST") {
      throw new Error("Lost opportunities cannot be marked Won");
    }
    this.stage = "WON";
    this.probability = 100;
    this.updatedAt = new Date();
  }

  public closeLost(reason: string): void {
    if (this.stage === "WON") {
      throw new Error("Won opportunities cannot be marked Lost");
    }
    this.stage = "LOST";
    this.probability = 0;
    this.lostReason = reason;
    this.updatedAt = new Date();
  }
}
