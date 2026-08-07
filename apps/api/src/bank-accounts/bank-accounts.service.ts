import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { bankAccounts, bankReconciliations } from '@ananya/database/schema';
import { desc } from '@ananya/database/query';

@Injectable()
export class BankAccountsService {
  async findAll() {
    const [accounts, reconciliations] = await Promise.all([
      db
        .select()
        .from(bankAccounts)
        .orderBy(bankAccounts.bankName, bankAccounts.accountName),
      db
        .select({
          bankAccountId: bankReconciliations.bankAccountId,
          closingBalance: bankReconciliations.closingBalance,
          statementDate: bankReconciliations.statementDate,
          status: bankReconciliations.status,
        })
        .from(bankReconciliations)
        .orderBy(desc(bankReconciliations.statementDate)),
    ]);

    const latestByAccount = new Map<
      string,
      { closingBalance: string; statementDate: Date; status: string }
    >();

    for (const row of reconciliations) {
      if (!latestByAccount.has(row.bankAccountId)) {
        latestByAccount.set(row.bankAccountId, row);
      }
    }

    return accounts.map((account) => {
      const latest = latestByAccount.get(account.id);
      const maskedAccountNumber =
        account.accountNumber.length > 4
          ? `${'•'.repeat(Math.max(account.accountNumber.length - 4, 0))}${account.accountNumber.slice(-4)}`
          : account.accountNumber;

      return {
        id: account.id,
        accountName: account.accountName,
        bankName: account.bankName,
        accountNumberMasked: maskedAccountNumber,
        currency: account.currency,
        isActive: account.isActive,
        latestStatementBalance: latest
          ? parseFloat(latest.closingBalance ?? '0')
          : null,
        latestStatementDate: latest?.statementDate ?? null,
        latestReconciliationStatus: latest?.status ?? null,
      };
    });
  }
}
