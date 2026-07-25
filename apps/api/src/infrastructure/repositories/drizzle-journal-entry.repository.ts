import { db } from '@ananya/database';
import { journalEntries, journalEntryLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  JournalEntryRecord,
  JournalEntryLineRecord,
} from '@ananya/database/schema';
import {
  JournalEntry,
  type JournalEntryRepository,
  type JournalStatus,
  type FindManyJournalEntriesOptions,
} from '@ananya/finance';

function toDomain(
  row: JournalEntryRecord,
  lines: JournalEntryLineRecord[] = [],
): JournalEntry {
  return JournalEntry.rehydrate({
    id: row.id,
    journalNumber: row.journalNumber,
    date: row.date,
    description: row.description,
    reference: row.reference ?? undefined,
    status: row.status as JournalStatus,
    lines: lines.map((l) => ({
      id: l.id,
      journalEntryId: l.journalEntryId,
      accountId: l.accountId,
      debit: parseFloat(l.debit),
      credit: parseFloat(l.credit),
      description: l.description ?? undefined,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleJournalEntryRepository implements JournalEntryRepository {
  async findById(id: string): Promise<JournalEntry | null> {
    const [row] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, id));
    return toDomain(row, lines);
  }

  async findByNumber(journalNumber: string): Promise<JournalEntry | null> {
    const [row] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.journalNumber, journalNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, row.id));
    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyJournalEntriesOptions,
  ): Promise<JournalEntry[]> {
    const query = db.select().from(journalEntries);
    if (options?.status) {
      query.where(eq(journalEntries.status, options.status));
    }
    const rows = await query.orderBy(desc(journalEntries.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(journalEntryLines)
          .where(eq(journalEntryLines.journalEntryId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(journalEntry: JournalEntry): Promise<void> {
    await db
      .insert(journalEntries)
      .values({
        id: journalEntry.id,
        journalNumber: journalEntry.journalNumber,
        date: journalEntry.date,
        description: journalEntry.description,
        reference: journalEntry.reference ?? null,
        status: journalEntry.status,
      })
      .onConflictDoUpdate({
        target: journalEntries.id,
        set: {
          description: journalEntry.description,
          reference: journalEntry.reference ?? null,
          status: journalEntry.status,
          updatedAt: new Date(),
        },
      });

    for (const line of journalEntry.lines) {
      await db
        .insert(journalEntryLines)
        .values({
          id: line.id,
          journalEntryId: journalEntry.id,
          accountId: line.accountId,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
          description: line.description ?? null,
        })
        .onConflictDoUpdate({
          target: journalEntryLines.id,
          set: {
            debit: line.debit.toString(),
            credit: line.credit.toString(),
            description: line.description ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextJournalNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(journalEntries);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `JE-${year}-${num}`;
  }
}
