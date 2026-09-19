import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { numberingSeries } from '@ananya/database/schema';
import { eq, sql } from '@ananya/database/query';
import {
  formatComponentSku,
  type ComponentSkuGenerator,
} from '@ananya/inventory';

@Injectable()
export class ComponentSkuService implements ComponentSkuGenerator {
  async generate(): Promise<string> {
    await db
      .insert(numberingSeries)
      .values({
        entityType: 'Component',
        prefix: 'CMP-',
        dateFormat: '',
        nextSequenceNumber: 1,
        zeroPadLength: 6,
      })
      .onConflictDoNothing({ target: numberingSeries.entityType });

    const [series] = await db
      .update(numberingSeries)
      .set({
        nextSequenceNumber: sql`${numberingSeries.nextSequenceNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(numberingSeries.entityType, 'Component'))
      .returning({
        sequence: sql<number>`${numberingSeries.nextSequenceNumber} - 1`,
        prefix: numberingSeries.prefix,
        zeroPadLength: numberingSeries.zeroPadLength,
      });

    if (!series) {
      throw new Error('Component numbering series could not be allocated');
    }

    return formatComponentSku(
      series.sequence,
      series.prefix,
      series.zeroPadLength,
    );
  }
}
