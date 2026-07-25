import { db } from '@ananya/database';
import { crmNotes } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { CrmNoteRecord } from '@ananya/database/schema';
import {
  Note,
  type NoteRepository,
  type FindManyNotesOptions,
} from '@ananya/crm';

function toDomain(row: CrmNoteRecord): Note {
  return Note.rehydrate({
    id: row.id,
    author: row.author,
    body: row.body,
    leadId: row.leadId ?? undefined,
    crmAccountId: row.crmAccountId ?? undefined,
    opportunityId: row.opportunityId ?? undefined,
    activityId: row.activityId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleNoteRepository implements NoteRepository {
  async findById(id: string): Promise<Note | null> {
    const [row] = await db
      .select()
      .from(crmNotes)
      .where(eq(crmNotes.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyNotesOptions): Promise<Note[]> {
    const query = db.select().from(crmNotes);
    if (options?.leadId) {
      query.where(eq(crmNotes.leadId, options.leadId));
    }
    if (options?.crmAccountId) {
      query.where(eq(crmNotes.crmAccountId, options.crmAccountId));
    }
    if (options?.opportunityId) {
      query.where(eq(crmNotes.opportunityId, options.opportunityId));
    }
    if (options?.activityId) {
      query.where(eq(crmNotes.activityId, options.activityId));
    }
    const rows = await query.orderBy(desc(crmNotes.createdAt));
    return rows.map(toDomain);
  }

  async save(note: Note): Promise<void> {
    await db
      .insert(crmNotes)
      .values({
        id: note.id,
        author: note.author,
        body: note.body,
        leadId: note.leadId ?? null,
        crmAccountId: note.crmAccountId ?? null,
        opportunityId: note.opportunityId ?? null,
        activityId: note.activityId ?? null,
      })
      .onConflictDoUpdate({
        target: crmNotes.id,
        set: {
          body: note.body,
          updatedAt: new Date(),
        },
      });
  }
}
