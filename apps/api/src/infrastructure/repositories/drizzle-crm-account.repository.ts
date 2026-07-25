import { db } from '@ananya/database';
import { crmAccounts, crmContacts } from '@ananya/database/schema';
import { eq, desc, ilike } from '@ananya/database/query';
import type {
  CrmAccountRecord,
  CrmContactRecord,
} from '@ananya/database/schema';
import {
  CrmAccount,
  type CrmAccountRepository,
  type ContactRole,
  type FindManyCrmAccountsOptions,
} from '@ananya/crm';

function toDomain(
  row: CrmAccountRecord,
  contacts: CrmContactRecord[] = [],
): CrmAccount {
  return CrmAccount.rehydrate({
    id: row.id,
    companyName: row.companyName,
    industry: row.industry ?? undefined,
    website: row.website ?? undefined,
    billingAddress: row.billingAddress ?? undefined,
    shippingAddress: row.shippingAddress ?? undefined,
    isArchived: row.isArchived,
    contacts: contacts.map((c) => ({
      id: c.id,
      crmAccountId: c.crmAccountId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone ?? undefined,
      role: c.role as ContactRole,
      isPrimary: c.isPrimary,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCrmAccountRepository implements CrmAccountRepository {
  async findById(id: string): Promise<CrmAccount | null> {
    const [row] = await db
      .select()
      .from(crmAccounts)
      .where(eq(crmAccounts.id, id))
      .limit(1);
    if (!row) return null;
    const contacts = await db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.crmAccountId, id));
    return toDomain(row, contacts);
  }

  async findMany(options?: FindManyCrmAccountsOptions): Promise<CrmAccount[]> {
    const query = db.select().from(crmAccounts);
    if (options?.isArchived !== undefined) {
      query.where(eq(crmAccounts.isArchived, options.isArchived));
    }
    if (options?.search) {
      query.where(ilike(crmAccounts.companyName, `%${options.search}%`));
    }
    const rows = await query.orderBy(desc(crmAccounts.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const contacts = await db
          .select()
          .from(crmContacts)
          .where(eq(crmContacts.crmAccountId, row.id));
        return toDomain(row, contacts);
      }),
    );
  }

  async save(account: CrmAccount): Promise<void> {
    await db
      .insert(crmAccounts)
      .values({
        id: account.id,
        companyName: account.companyName,
        industry: account.industry ?? null,
        website: account.website ?? null,
        billingAddress: account.billingAddress ?? null,
        shippingAddress: account.shippingAddress ?? null,
        isArchived: account.isArchived,
      })
      .onConflictDoUpdate({
        target: crmAccounts.id,
        set: {
          companyName: account.companyName,
          industry: account.industry ?? null,
          website: account.website ?? null,
          billingAddress: account.billingAddress ?? null,
          shippingAddress: account.shippingAddress ?? null,
          isArchived: account.isArchived,
          updatedAt: new Date(),
        },
      });

    for (const c of account.contacts) {
      await db
        .insert(crmContacts)
        .values({
          id: c.id,
          crmAccountId: account.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone ?? null,
          role: c.role,
          isPrimary: c.isPrimary,
        })
        .onConflictDoUpdate({
          target: crmContacts.id,
          set: {
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone ?? null,
            role: c.role,
            isPrimary: c.isPrimary,
            updatedAt: new Date(),
          },
        });
    }
  }
}
