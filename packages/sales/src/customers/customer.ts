import { ObjectId } from '@ananya/core';

export type CustomerStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type CreditStatus = 'OK' | 'ON_HOLD' | 'CREDIT_EXCEEDED';
export type AddressType = 'BILLING' | 'SHIPPING' | 'BOTH';

export interface CustomerContactProps {
  id: string;
  customerId: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddressProps {
  id: string;
  customerId: string;
  addressType: AddressType;
  street1: string;
  street2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerProps {
  id: string;
  customerNumber: string;
  name: string;
  email: string;
  phone?: string | null;
  taxId?: string | null;
  currency: string;
  status: CustomerStatus;
  creditStatus: CreditStatus;
  contacts?: CustomerContactProps[];
  addresses?: CustomerAddressProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerInput {
  customerNumber: string;
  name: string;
  email: string;
  phone?: string | null;
  taxId?: string | null;
  currency?: string;
}

export class Customer {
  public readonly id: string;
  public readonly customerNumber: string;
  public name: string;
  public email: string;
  public phone?: string | null;
  public taxId?: string | null;
  public currency: string;
  public status: CustomerStatus;
  public creditStatus: CreditStatus;
  public readonly contacts: CustomerContactProps[];
  public readonly addresses: CustomerAddressProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: CustomerProps) {
    this.id = props.id;
    this.customerNumber = props.customerNumber;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.taxId = props.taxId;
    this.currency = props.currency;
    this.status = props.status;
    this.creditStatus = props.creditStatus;
    this.contacts = props.contacts ?? [];
    this.addresses = props.addresses ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateCustomerInput): Customer {
    const now = new Date();
    return new Customer({
      id: ObjectId.generate().value,
      customerNumber: input.customerNumber.toUpperCase(),
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone ?? null,
      taxId: input.taxId ?? null,
      currency: input.currency || 'USD',
      status: 'DRAFT',
      creditStatus: 'OK',
      contacts: [],
      addresses: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: CustomerProps): Customer {
    return new Customer(props);
  }

  activate(): void {
    if (this.status === 'ARCHIVED') {
      throw new Error('Cannot activate an archived customer account.');
    }
    this.status = 'ACTIVE';
    this.updatedAt = new Date();
  }

  suspend(): void {
    this.status = 'SUSPENDED';
    this.updatedAt = new Date();
  }

  archive(): void {
    this.status = 'ARCHIVED';
    this.updatedAt = new Date();
  }

  updateCreditStatus(status: CreditStatus): void {
    this.creditStatus = status;
    this.updatedAt = new Date();
  }

  addContact(input: {
    name: string;
    email: string;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
  }): CustomerContactProps {
    const now = new Date();
    const contact: CustomerContactProps = {
      id: ObjectId.generate().value,
      customerId: this.id,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? this.contacts.length === 0,
      createdAt: now,
      updatedAt: now,
    };
    if (contact.isPrimary) {
      this.contacts.forEach((c) => (c.isPrimary = false));
    }
    this.contacts.push(contact);
    this.updatedAt = now;
    return contact;
  }

  addAddress(input: {
    addressType: AddressType;
    street1: string;
    street2?: string | null;
    city: string;
    state?: string | null;
    postalCode: string;
    country: string;
    isDefault?: boolean;
  }): CustomerAddressProps {
    const now = new Date();
    const address: CustomerAddressProps = {
      id: ObjectId.generate().value,
      customerId: this.id,
      addressType: input.addressType,
      street1: input.street1,
      street2: input.street2 ?? null,
      city: input.city,
      state: input.state ?? null,
      postalCode: input.postalCode,
      country: input.country,
      isDefault: input.isDefault ?? this.addresses.length === 0,
      createdAt: now,
      updatedAt: now,
    };
    if (address.isDefault) {
      this.addresses
        .filter((a) => a.addressType === input.addressType)
        .forEach((a) => (a.isDefault = false));
    }
    this.addresses.push(address);
    this.updatedAt = now;
    return address;
  }
}
