import {
  BankReconciliation,
  ReconciliationStatus,
} from "./bank-reconciliation";

export interface FindManyReconciliationsOptions {
  bankAccountId?: string;
  status?: ReconciliationStatus;
}

export interface BankReconciliationRepository {
  findById(id: string): Promise<BankReconciliation | null>;
  findMany(
    options?: FindManyReconciliationsOptions,
  ): Promise<BankReconciliation[]>;
  save(reconciliation: BankReconciliation): Promise<void>;
}
