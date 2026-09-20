import { formatComponentSku } from '@ananya/inventory';

/**
 * Component SKU allocation.
 *
 * The numbering series cursor is the first sequence number worth offering, but
 * it is not a reservation: components created from a previewed `CMP-######`
 * value accept that SKU directly, so the cursor can sit behind SKUs that are
 * already taken. Both the preview endpoint and callers that re-check a
 * candidate scan forward from the cursor and never offer a taken number.
 */

export const DEFAULT_COMPONENT_SKU_PREFIX = 'CMP-';
export const DEFAULT_COMPONENT_SKU_ZERO_PAD_LENGTH = 6;
export const MAX_COMPONENT_SKU_ALLOCATION_ATTEMPTS = 1000;

export interface ComponentSkuAllocationOptions {
  /** Numbering-series cursor: the first sequence number worth offering. */
  startSequence: number;
  prefix?: string;
  zeroPadLength?: number;
  isTaken: (sku: string) => Promise<boolean>;
  maxAttempts?: number;
}

export interface ComponentSkuAllocation {
  sku: string;
  sequence: number;
}

/** Falls back to the first sequence for a missing or malformed cursor. */
export function normalizeComponentSkuStartSequence(
  sequence: number | undefined,
): number {
  if (typeof sequence !== 'number' || !Number.isInteger(sequence)) return 1;
  return sequence > 0 ? sequence : 1;
}

/**
 * Returns the first SKU at or after the cursor that is not taken, or `null`
 * when `maxAttempts` consecutive numbers are all taken.
 */
export async function findFirstAvailableComponentSku(
  options: ComponentSkuAllocationOptions,
): Promise<ComponentSkuAllocation | null> {
  const prefix = options.prefix ?? DEFAULT_COMPONENT_SKU_PREFIX;
  const zeroPadLength =
    options.zeroPadLength ?? DEFAULT_COMPONENT_SKU_ZERO_PAD_LENGTH;
  const requestedAttempts =
    options.maxAttempts ?? MAX_COMPONENT_SKU_ALLOCATION_ATTEMPTS;
  const maxAttempts =
    Number.isInteger(requestedAttempts) && requestedAttempts > 0
      ? requestedAttempts
      : MAX_COMPONENT_SKU_ALLOCATION_ATTEMPTS;
  const startSequence = normalizeComponentSkuStartSequence(
    options.startSequence,
  );

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const sequence = startSequence + offset;
    const sku = formatComponentSku(sequence, prefix, zeroPadLength);
    if (!(await options.isTaken(sku))) {
      return { sku, sequence };
    }
  }

  return null;
}
