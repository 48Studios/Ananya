import { CrmAccount } from './crm-account';

export interface FindManyCrmAccountsOptions {
  isArchived?: boolean;
  search?: string;
}

export interface CrmAccountRepository {
  findById(id: string): Promise<CrmAccount | null>;
  findMany(options?: FindManyCrmAccountsOptions): Promise<CrmAccount[]>;
  save(account: CrmAccount): Promise<void>;
}
