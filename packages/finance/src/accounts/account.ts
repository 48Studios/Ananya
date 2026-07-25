import { ObjectId } from '@ananya/core';

export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

export interface AccountProps {
  id: string;
  accountNumber: string;
  name: string;
  accountType: AccountType;
  parentAccountId?: string;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountProps {
  accountNumber: string;
  name: string;
  accountType: AccountType;
  parentAccountId?: string;
  currency?: string;
}

export class Account implements AccountProps {
  public readonly id: string;
  public accountNumber: string;
  public name: string;
  public accountType: AccountType;
  public parentAccountId?: string;
  public currency: string;
  public isActive: boolean;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: AccountProps) {
    this.id = props.id;
    this.accountNumber = props.accountNumber;
    this.name = props.name;
    this.accountType = props.accountType;
    this.parentAccountId = props.parentAccountId;
    this.currency = props.currency;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateAccountProps): Account {
    if (!props.accountNumber || props.accountNumber.trim() === '') {
      throw new Error('Account number is required');
    }
    if (!props.name || props.name.trim() === '') {
      throw new Error('Account name is required');
    }

    const now = new Date();
    return new Account({
      id: ObjectId.generate().value,
      accountNumber: props.accountNumber.trim(),
      name: props.name.trim(),
      accountType: props.accountType,
      parentAccountId: props.parentAccountId,
      currency: props.currency || 'USD',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: AccountProps): Account {
    return new Account(props);
  }

  public activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  public deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
