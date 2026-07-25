import { db } from '@ananya/database';
import { serviceNotes } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { ServiceNoteRecord } from '@ananya/database/schema';
import {
  ServiceNote,
  type ServiceNoteRepository,
  type FindManyServiceNotesOptions,
} from '@ananya/service';

function toDomain(row: ServiceNoteRecord): ServiceNote {
  return ServiceNote.rehydrate({
    id: row.id,
    serviceRequestId: row.serviceRequestId ?? undefined,
    workOrderId: row.workOrderId ?? undefined,
    warrantyClaimId: row.warrantyClaimId ?? undefined,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt,
  });
}

export class DrizzleServiceNoteRepository implements ServiceNoteRepository {
  async findById(id: string): Promise<ServiceNote | null> {
    const [row] = await db
      .select()
      .from(serviceNotes)
      .where(eq(serviceNotes.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyServiceNotesOptions,
  ): Promise<ServiceNote[]> {
    const query = db.select().from(serviceNotes);
    if (options?.serviceRequestId) {
      query.where(eq(serviceNotes.serviceRequestId, options.serviceRequestId));
    }
    if (options?.workOrderId) {
      query.where(eq(serviceNotes.workOrderId, options.workOrderId));
    }
    if (options?.warrantyClaimId) {
      query.where(eq(serviceNotes.warrantyClaimId, options.warrantyClaimId));
    }

    const rows = await query.orderBy(desc(serviceNotes.createdAt));
    return rows.map(toDomain);
  }

  async save(note: ServiceNote): Promise<void> {
    await db
      .insert(serviceNotes)
      .values({
        id: note.id,
        serviceRequestId: note.serviceRequestId ?? null,
        workOrderId: note.workOrderId ?? null,
        warrantyClaimId: note.warrantyClaimId ?? null,
        author: note.author,
        body: note.body,
      })
      .onConflictDoNothing();
  }
}
