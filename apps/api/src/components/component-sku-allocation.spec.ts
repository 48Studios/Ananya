import {
  DEFAULT_COMPONENT_SKU_ZERO_PAD_LENGTH,
  findFirstAvailableComponentSku,
  MAX_COMPONENT_SKU_ALLOCATION_ATTEMPTS,
  normalizeComponentSkuStartSequence,
} from './component-sku-allocation';

function takenSet(skus: string[]): {
  isTaken: (sku: string) => Promise<boolean>;
  calls: string[];
} {
  const taken = new Set(skus);
  const calls: string[] = [];
  return {
    calls,
    isTaken: (sku: string) => {
      calls.push(sku);
      return Promise.resolve(taken.has(sku));
    },
  };
}

describe('findFirstAvailableComponentSku', () => {
  it('offers the cursor when it is free', async () => {
    const { isTaken, calls } = takenSet([]);

    const allocation = await findFirstAvailableComponentSku({
      startSequence: 3,
      isTaken,
    });

    expect(allocation).toEqual({ sku: 'CMP-000003', sequence: 3 });
    expect(calls).toEqual(['CMP-000003']);
  });

  it('skips SKUs that already exist', async () => {
    const { isTaken } = takenSet(['CMP-000003', 'CMP-000004']);

    const allocation = await findFirstAvailableComponentSku({
      startSequence: 3,
      isTaken,
    });

    expect(allocation).toEqual({ sku: 'CMP-000005', sequence: 5 });
  });

  it('honours the numbering-series prefix and padding', async () => {
    const { isTaken } = takenSet(['PRT-0001']);

    const allocation = await findFirstAvailableComponentSku({
      startSequence: 1,
      prefix: 'PRT-',
      zeroPadLength: 4,
      isTaken,
    });

    expect(allocation).toEqual({ sku: 'PRT-0002', sequence: 2 });
  });

  it('returns null instead of scanning without bound', async () => {
    const { isTaken, calls } = takenSet([
      'CMP-000001',
      'CMP-000002',
      'CMP-000003',
    ]);

    const allocation = await findFirstAvailableComponentSku({
      startSequence: 1,
      isTaken,
      maxAttempts: 3,
    });

    expect(allocation).toBeNull();
    expect(calls).toHaveLength(3);
  });

  it('treats a malformed cursor as the first sequence', async () => {
    const { isTaken, calls } = takenSet([]);

    await expect(
      findFirstAvailableComponentSku({ startSequence: 0, isTaken }),
    ).resolves.toEqual({ sku: 'CMP-000001', sequence: 1 });
    await expect(
      findFirstAvailableComponentSku({
        startSequence: Number.NaN,
        isTaken,
      }),
    ).resolves.toEqual({ sku: 'CMP-000001', sequence: 1 });
    expect(calls).toEqual(['CMP-000001', 'CMP-000001']);
  });

  it('defaults the scan bound', () => {
    expect(MAX_COMPONENT_SKU_ALLOCATION_ATTEMPTS).toBe(1000);
    expect(DEFAULT_COMPONENT_SKU_ZERO_PAD_LENGTH).toBe(6);
  });
});

describe('normalizeComponentSkuStartSequence', () => {
  it('keeps positive integers and falls back to one', () => {
    expect(normalizeComponentSkuStartSequence(12)).toBe(12);
    expect(normalizeComponentSkuStartSequence(1)).toBe(1);
    expect(normalizeComponentSkuStartSequence(0)).toBe(1);
    expect(normalizeComponentSkuStartSequence(-4)).toBe(1);
    expect(normalizeComponentSkuStartSequence(2.5)).toBe(1);
    expect(normalizeComponentSkuStartSequence(undefined)).toBe(1);
  });
});
