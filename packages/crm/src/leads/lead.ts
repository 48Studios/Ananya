import { ObjectId } from "@ananya/core";

export type LeadStatus = "NEW" | "QUALIFIED" | "DISQUALIFIED" | "CONVERTED";

export type LeadSource =
  "WEBSITE" | "REFERRAL" | "TRADE_SHOW" | "COLD_OUTREACH" | "INBOUND_PHONE";

export interface LeadProps {
  id: string;
  leadNumber: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  source: LeadSource;
  industry?: string;
  owner: string;
  status: LeadStatus;
  disqualificationReason?: string;
  convertedAccountId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadProps {
  leadNumber: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  source?: LeadSource;
  industry?: string;
  owner: string;
}

export class Lead implements LeadProps {
  public readonly id: string;
  public leadNumber: string;
  public name: string;
  public company: string;
  public email?: string;
  public phone?: string;
  public source: LeadSource;
  public industry?: string;
  public owner: string;
  public status: LeadStatus;
  public disqualificationReason?: string;
  public convertedAccountId?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: LeadProps) {
    this.id = props.id;
    this.leadNumber = props.leadNumber;
    this.name = props.name;
    this.company = props.company;
    this.email = props.email;
    this.phone = props.phone;
    this.source = props.source;
    this.industry = props.industry;
    this.owner = props.owner;
    this.status = props.status;
    this.disqualificationReason = props.disqualificationReason;
    this.convertedAccountId = props.convertedAccountId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateLeadProps): Lead {
    if (!props.name || props.name.trim() === "") {
      throw new Error("Lead name is required");
    }
    if (!props.company || props.company.trim() === "") {
      throw new Error("Lead company is required");
    }

    const now = new Date();
    return new Lead({
      id: ObjectId.generate().value,
      leadNumber: props.leadNumber,
      name: props.name.trim(),
      company: props.company.trim(),
      email: props.email?.trim(),
      phone: props.phone?.trim(),
      source: props.source || "WEBSITE",
      industry: props.industry?.trim(),
      owner: props.owner,
      status: "NEW",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: LeadProps): Lead {
    return new Lead(props);
  }

  public assignOwner(newOwner: string): void {
    if (this.status === "CONVERTED" || this.status === "DISQUALIFIED") {
      throw new Error(
        `Cannot reassign owner for lead in status ${this.status}`,
      );
    }
    this.owner = newOwner;
    this.updatedAt = new Date();
  }

  public qualify(): void {
    if (this.status !== "NEW") {
      throw new Error(
        `Only NEW leads can be qualified (current: ${this.status})`,
      );
    }
    this.status = "QUALIFIED";
    this.updatedAt = new Date();
  }

  public disqualify(reason: string): void {
    if (this.status === "CONVERTED") {
      throw new Error("Converted leads cannot be disqualified");
    }
    this.status = "DISQUALIFIED";
    this.disqualificationReason = reason;
    this.updatedAt = new Date();
  }

  public convert(convertedAccountId: string): void {
    if (this.status !== "QUALIFIED") {
      throw new Error(
        "Only QUALIFIED leads can be converted into CRM Accounts",
      );
    }
    this.status = "CONVERTED";
    this.convertedAccountId = convertedAccountId;
    this.updatedAt = new Date();
  }
}
