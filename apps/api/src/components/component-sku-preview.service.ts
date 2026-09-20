import { Inject, Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { numberingSeries } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import {
  formatComponentSku,
  type ComponentRepository,
} from '@ananya/inventory';
import { COMPONENT_REPOSITORY } from './component.tokens';
import {
  DEFAULT_COMPONENT_SKU_PREFIX,
  DEFAULT_COMPONENT_SKU_ZERO_PAD_LENGTH,
  findFirstAvailableComponentSku,
  normalizeComponentSkuStartSequence,
} from './component-sku-allocation';

/**
 * Read-only preview of the SKU a new component would receive.
 *
 * The numbering-series cursor is not a reservation: a component created from an
 * earlier preview keeps that SKU while the cursor stays behind it. The preview
 * therefore scans forward from the cursor and reports the first number that is
 * actually free, so the form never prefills a SKU that already exists.
 */
@Injectable()
export class ComponentSkuPreviewService {
  constructor(
    @Inject(COMPONENT_REPOSITORY)
    private readonly components: ComponentRepository,
  ) {}

  async preview(): Promise<string> {
    const [series] = await db
      .select()
      .from(numberingSeries)
      .where(eq(numberingSeries.entityType, 'Component'));

    const prefix = series?.prefix ?? DEFAULT_COMPONENT_SKU_PREFIX;
    const zeroPadLength =
      series?.zeroPadLength ?? DEFAULT_COMPONENT_SKU_ZERO_PAD_LENGTH;
    const startSequence = normalizeComponentSkuStartSequence(
      series?.nextSequenceNumber,
    );

    const allocation = await findFirstAvailableComponentSku({
      startSequence,
      prefix,
      zeroPadLength,
      isTaken: async (sku) => (await this.components.findBySku(sku)) !== null,
    });

    // Exhaustion means the next thousand numbers are all taken, which is a data
    // symptom; a read endpoint still answers with the raw cursor value instead
    // of failing.
    return (
      allocation?.sku ??
      formatComponentSku(startSequence, prefix, zeroPadLength)
    );
  }
}
