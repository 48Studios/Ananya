import { db } from '@ananya/database';
import { accounts } from '@ananya/database/schema';
import { eq, desc, ilike, or } from '@ananya/database/query';
import type { AccountRecord } from '@ananya/database/schema';
import {
  Account,
  type AccountRepository,
  type AccountType,
  type FindManyAccountsOptions,
} from '@ananya/finance';

function toDomain(row: AccountRecord): Account {
  return Account.rehydrate({
    id: row.id,
    accountNumber: row.accountNumber,
    name: row.name,
    accountType: row.accountType as AccountType,
    parentAccountId: row.parentAccountId ?? undefined,
    currency: row.currency,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleAccountRepository implements AccountRepository {
  async findById(id: string): Promise<Account | null> {
    const [row] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(accountNumber: string): Promise<Account | null> {
    const [row] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.accountNumber, accountNumber.trim()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyAccountsOptions): Promise<Account[]> {
    const query = db.select().from(accounts);
    if (options?.accountType) {
      query.where(eq(accounts.accountType, options.accountType));
    }
    if (options?.isActive !== undefined) {
      query.where(eq(accounts.isActive, options.isActive));
    }
    if (options?.search) {
      const term = `%${options.search}%`;
      query.where(
        or(ilike(accounts.name, term), ilike(accounts.accountNumber, term)),
      );
    }
    const rows = await query.orderBy(desc(accounts.accountNumber));
    return rows.map(toDomain);
  }

  async save(account: Account): Promise<void> {
    await db
      .insert(accounts)
      .values({
        id: account.id,
        accountNumber: account.accountNumber,
        name: account.name,
        accountType: account.accountType,
        parentAccountId: account.parentAccountId ?? null,
        currency: account.currency,
        isActive: account.isActive,
      })
      .onConflictDoUpdate({
        target: accounts.id,
        set: {
          name: account.name,
          accountType: account.accountType,
          parentAccountId: account.parentAccountId ?? null,
          currency: account.currency,
          isActive: account.isActive,
          updatedAt: new Date(),
        },
      });
  }
}
