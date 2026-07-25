import { ObjectId } from '@ananya/core';

export type ReconciliationStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface BankTransactionProps {
  id: string;
  bankReconciliationId: string;
  transactionDate: Date;
  description: string;
  amount: number;
  matchedPaymentId?: string;
  isMatched: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankReconciliationProps {
  id: string;
  bankAccountId: string;
  statementDate: Date;
  openingBalance: number;
  closingBalance: number;
  status: ReconciliationStatus;
  transactions: BankTransactionProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBankReconciliationProps {
  bankAccountId: string;
  statementDate: Date;
  openingBalance: number;
  closingBalance: number;
}

export interface AddBankTransactionProps {
  transactionDate: Date;
  description: string;
  amount: number;
}

export class BankReconciliation implements BankReconciliationProps {
  public readonly id: string;
  public bankAccountId: string;
  public statementDate: Date;
  public openingBalance: number;
  public closingBalance: number;
  public status: ReconciliationStatus;
  public transactions: BankTransactionProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: BankReconciliationProps) {
    this.id = props.id;
    this.bankAccountId = props.bankAccountId;
    this.statementDate = props.statementDate;
    this.openingBalance = props.openingBalance;
    this.closingBalance = props.closingBalance;
    this.status = props.status;
    this.transactions = props.transactions;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    props: CreateBankReconciliationProps,
  ): BankReconciliation {
    const now = new Date();
    return new BankReconciliation({
      id: ObjectId.generate().value,
      bankAccountId: props.bankAccountId,
      statementDate: props.statementDate,
      openingBalance: props.openingBalance,
      closingBalance: props.closingBalance,
      status: 'IN_PROGRESS',
      transactions: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: BankReconciliationProps): BankReconciliation {
    return new BankReconciliation(props);
  }

  public addTransaction(
    props: AddBankTransactionProps,
  ): BankTransactionProps {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error(
        'Transactions can only be added to IN_PROGRESS reconciliations',
      );
    }
    const now = new Date();
    const tx: BankTransactionProps = {
      id: ObjectId.generate().value,
      bankReconciliationId: this.id,
      transactionDate: props.transactionDate,
      description: props.description,
      amount: props.amount,
      isMatched: false,
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.push(tx);
    this.updatedAt = now;
    return tx;
  }

  public matchTransaction(transactionId: string, paymentId: string): void {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error('Can only match transactions when IN_PROGRESS');
    }
    const tx = this.transactions.find((t) => t.id === transactionId);
    if (!tx) {
      throw new Error(`Transaction with ID ${transactionId} not found`);
    }
    tx.matchedPaymentId = paymentId;
    tx.isMatched = true;
    tx.updatedAt = new Date();
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error(
        `Cannot complete reconciliation in status ${this.status}`,
      );
    }
    const unmatchedCount = this.transactions.filter((t) => !t.isMatched).length;
    if (unmatchedCount > 0) {
      throw new Error(
        `Cannot complete reconciliation with ${unmatchedCount} unmatched transactions`,
      );
    }
    this.status = 'COMPLETED';
    this.updatedAt = new Date();
  }
}
