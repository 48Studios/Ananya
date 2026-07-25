import { Account, AccountType } from './account';

export interface FindManyAccountsOptions {
  accountType?: AccountType;
  isActive?: boolean;
  search?: string;
}

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByNumber(accountNumber: string): Promise<Account | null>;
  findMany(options?: FindManyAccountsOptions): Promise<Account[]>;
  save(account: Account): Promise<void>;
}
