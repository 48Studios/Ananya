import { db } from '@ananya/database';
import { warrantyClaims } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { WarrantyClaimRecord } from '@ananya/database/schema';
import {
  WarrantyClaim,
  type WarrantyClaimRepository,
  type WarrantyDecision,
  type FindManyWarrantyClaimsOptions,
} from '@ananya/service';

function toDomain(row: WarrantyClaimRecord): WarrantyClaim {
  return WarrantyClaim.rehydrate({
    id: row.id,
    warrantyNumber: row.warrantyNumber,
    customerId: row.customerId,
    productId: row.productId,
    serialNumber: row.serialNumber ?? undefined,
    purchaseDate: row.purchaseDate,
    expiryDate: row.expiryDate,
    claimReason: row.claimReason,
    decision: row.decision as WarrantyDecision,
    decisionNotes: row.decisionNotes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleWarrantyClaimRepository implements WarrantyClaimRepository {
  async findById(id: string): Promise<WarrantyClaim | null> {
    const [row] = await db
      .select()
      .from(warrantyClaims)
      .where(eq(warrantyClaims.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(warrantyNumber: string): Promise<WarrantyClaim | null> {
    const [row] = await db
      .select()
      .from(warrantyClaims)
      .where(eq(warrantyClaims.warrantyNumber, warrantyNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyWarrantyClaimsOptions,
  ): Promise<WarrantyClaim[]> {
    const query = db.select().from(warrantyClaims);
    if (options?.customerId) {
      query.where(eq(warrantyClaims.customerId, options.customerId));
    }
    if (options?.productId) {
      query.where(eq(warrantyClaims.productId, options.productId));
    }
    if (options?.decision) {
      query.where(eq(warrantyClaims.decision, options.decision));
    }
    if (options?.search) {
      query.where(ilike(warrantyClaims.claimReason, `%${options.search}%`));
    }

    const rows = await query.orderBy(desc(warrantyClaims.createdAt));
    return rows.map(toDomain);
  }

  async save(claim: WarrantyClaim): Promise<void> {
    await db
      .insert(warrantyClaims)
      .values({
        id: claim.id,
        warrantyNumber: claim.warrantyNumber,
        customerId: claim.customerId,
        productId: claim.productId,
        serialNumber: claim.serialNumber ?? null,
        purchaseDate: claim.purchaseDate,
        expiryDate: claim.expiryDate,
        claimReason: claim.claimReason,
        decision: claim.decision,
        decisionNotes: claim.decisionNotes ?? null,
      })
      .onConflictDoUpdate({
        target: warrantyClaims.id,
        set: {
          decision: claim.decision,
          decisionNotes: claim.decisionNotes ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextWarrantyNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(warrantyClaims);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `WAR-${year}-${num}`;
  }
}
