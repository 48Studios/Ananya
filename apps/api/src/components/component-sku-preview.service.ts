import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { numberingSeries } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { formatComponentSku } from '@ananya/inventory';

@Injectable()
export class ComponentSkuPreviewService {
  async preview(): Promise<string> {
    const [series] = await db
      .select()
      .from(numberingSeries)
      .where(eq(numberingSeries.entityType, 'Component'));

    if (!series) return 'CMP-000001';

    return formatComponentSku(
      series.nextSequenceNumber,
      series.prefix,
      series.zeroPadLength,
    );
  }
}
