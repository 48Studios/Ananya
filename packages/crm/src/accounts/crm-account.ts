import { ObjectId } from "@ananya/core";

export type ContactRole =
  "DECISION_MAKER" | "EVALUATOR" | "EXECUTIVE" | "TECHNICAL_BUYER" | "OTHER";

export interface ContactProps {
  id: string;
  crmAccountId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: ContactRole;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrmAccountProps {
  id: string;
  companyName: string;
  industry?: string;
  website?: string;
  billingAddress?: string;
  shippingAddress?: string;
  isArchived: boolean;
  contacts: ContactProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCrmAccountProps {
  companyName: string;
  industry?: string;
  website?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

export interface AddContactProps {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role?: ContactRole;
  isPrimary?: boolean;
}

export class CrmAccount implements CrmAccountProps {
  public readonly id: string;
  public companyName: string;
  public industry?: string;
  public website?: string;
  public billingAddress?: string;
  public shippingAddress?: string;
  public isArchived: boolean;
  public contacts: ContactProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: CrmAccountProps) {
    this.id = props.id;
    this.companyName = props.companyName;
    this.industry = props.industry;
    this.website = props.website;
    this.billingAddress = props.billingAddress;
    this.shippingAddress = props.shippingAddress;
    this.isArchived = props.isArchived;
    this.contacts = props.contacts;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateCrmAccountProps): CrmAccount {
    if (!props.companyName || props.companyName.trim() === "") {
      throw new Error("CRM Account company name is required");
    }

    const now = new Date();
    return new CrmAccount({
      id: ObjectId.generate().value,
      companyName: props.companyName.trim(),
      industry: props.industry?.trim(),
      website: props.website?.trim(),
      billingAddress: props.billingAddress?.trim(),
      shippingAddress: props.shippingAddress?.trim(),
      isArchived: false,
      contacts: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: CrmAccountProps): CrmAccount {
    return new CrmAccount(props);
  }

  public addContact(props: AddContactProps): ContactProps {
    if (this.isArchived) {
      throw new Error("Cannot add contacts to an archived CRM Account");
    }
    if (!props.firstName || !props.lastName || !props.email) {
      throw new Error("Contact firstName, lastName, and email are required");
    }

    const now = new Date();
    const isPrimary = props.isPrimary ?? this.contacts.length === 0;

    if (isPrimary) {
      this.contacts.forEach((c) => {
        c.isPrimary = false;
      });
    }

    const contact: ContactProps = {
      id: ObjectId.generate().value,
      crmAccountId: this.id,
      firstName: props.firstName.trim(),
      lastName: props.lastName.trim(),
      email: props.email.trim(),
      phone: props.phone?.trim(),
      role: props.role || "OTHER",
      isPrimary,
      createdAt: now,
      updatedAt: now,
    };

    this.contacts.push(contact);
    this.updatedAt = now;
    return contact;
  }

  public archive(): void {
    this.isArchived = true;
    this.updatedAt = new Date();
  }
}
