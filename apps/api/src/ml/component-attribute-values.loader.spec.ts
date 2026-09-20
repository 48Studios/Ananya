import { compareComponentAttributes } from './component-attribute-values.loader';
import { buildIdentityAttributeIndex } from './component-duplicate-intelligence';
import type { ComponentAttributeValueRow } from './component-duplicate-intelligence';

/**
 * Attribute comparison tests (Pass 6A).
 *
 * The consolidation preview must classify attributes the same way the duplicate
 * analyzer compares them, and must never silently pick a winner. These tests pin
 * that classification.
 */

function quantityRow(
  componentId: string,
  code: string,
  value: string,
  unit = 'kohm',
): ComponentAttributeValueRow {
  return {
    componentId,
    attributeDefinitionId: `def-${code}`,
    code,
    label: code === 'resistance' ? 'Resistance' : code,
    dataType: 'QUANTITY',
    numberValue: value,
    normalizedNumberValue: value,
    booleanValue: null,
    optionId: null,
    unit,
  };
}

function index(rows: ComponentAttributeValueRow[]) {
  return buildIdentityAttributeIndex(rows);
}

describe('Attribute comparison for consolidation (Pass 6A)', () => {
  it('17. classifies equal values as IDENTICAL', () => {
    const values = index([
      quantityRow('canonical', 'resistance', '10000'),
      quantityRow('source', 'resistance', '10000'),
    ]);

    const entries = compareComponentAttributes({
      canonicalAttributes: values.get('canonical'),
      sourceAttributes: values.get('source'),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      code: 'resistance',
      classification: 'IDENTICAL',
      canonicalValue: '10000 kohm',
      sourceValue: '10000 kohm',
    });
  });

  it('18. classifies a source-only value without treating it as a conflict', () => {
    const values = index([
      quantityRow('canonical', 'resistance', '10000'),
      quantityRow('source', 'resistance', '10000'),
      quantityRow('source', 'power_rating', '0.125', 'W'),
    ]);

    const entries = compareComponentAttributes({
      canonicalAttributes: values.get('canonical'),
      sourceAttributes: values.get('source'),
    });
    const byCode = Object.fromEntries(
      entries.map((entry) => [entry.code, entry]),
    );

    expect(byCode.power_rating).toMatchObject({
      classification: 'SOURCE_ONLY',
      canonicalValue: null,
      sourceValue: '0.125 W',
    });
    expect(byCode.resistance!.classification).toBe('IDENTICAL');
  });

  it('classifies a canonical-only value as retained, not as a conflict', () => {
    const values = index([
      quantityRow('canonical', 'resistance', '10000'),
      quantityRow('canonical', 'voltage_rating', '25', 'V'),
      quantityRow('source', 'resistance', '10000'),
    ]);

    const entries = compareComponentAttributes({
      canonicalAttributes: values.get('canonical'),
      sourceAttributes: values.get('source'),
    });
    const voltage = entries.find((entry) => entry.code === 'voltage_rating');

    expect(voltage).toMatchObject({
      classification: 'CANONICAL_ONLY',
      canonicalValue: '25 V',
      sourceValue: null,
    });
  });

  it('19. classifies differing values as CONFLICTING with both values shown', () => {
    const values = index([
      quantityRow('canonical', 'resistance', '10000'),
      quantityRow('source', 'resistance', '22000'),
    ]);

    const entries = compareComponentAttributes({
      canonicalAttributes: values.get('canonical'),
      sourceAttributes: values.get('source'),
    });

    expect(entries[0]).toMatchObject({
      classification: 'CONFLICTING',
      canonicalValue: '10000 kohm',
      sourceValue: '22000 kohm',
    });
  });

  it('never picks a winner: no "latest", "highest" or "source wins" behaviour', () => {
    const values = index([
      quantityRow('canonical', 'resistance', '10000'),
      quantityRow('source', 'resistance', '22000'),
    ]);

    const entries = compareComponentAttributes({
      canonicalAttributes: values.get('canonical'),
      sourceAttributes: values.get('source'),
    });

    // Both values survive to the DTO so a human decides.
    expect(entries[0]!.canonicalValue).not.toBeNull();
    expect(entries[0]!.sourceValue).not.toBeNull();
    expect(entries[0]!.canonicalValue).not.toBe(entries[0]!.sourceValue);
  });

  it('treats missing values on both sides as no attribute at all', () => {
    const values = index([quantityRow('canonical', 'resistance', '10000')]);

    expect(
      compareComponentAttributes({
        canonicalAttributes: values.get('canonical'),
        sourceAttributes: undefined,
      }),
    ).toHaveLength(1);
    expect(
      compareComponentAttributes({
        canonicalAttributes: undefined,
        sourceAttributes: undefined,
      }),
    ).toEqual([]);
  });

  it('sorts entries deterministically by attribute code', () => {
    const values = index([
      quantityRow('canonical', 'voltage_rating', '25', 'V'),
      quantityRow('canonical', 'resistance', '10000'),
      quantityRow('source', 'package', '0805'),
    ]);

    const entries = compareComponentAttributes({
      canonicalAttributes: values.get('canonical'),
      sourceAttributes: values.get('source'),
    });

    expect(entries.map((entry) => entry.code)).toEqual([
      'package',
      'resistance',
      'voltage_rating',
    ]);
  });

  it('is symmetric for identical inputs (order-independent result)', () => {
    const canonicalRows = [quantityRow('canonical', 'resistance', '10000')];
    const sourceRows = [quantityRow('source', 'resistance', '22000')];

    const forward = compareComponentAttributes({
      canonicalAttributes: index(canonicalRows).get('canonical'),
      sourceAttributes: index(sourceRows).get('source'),
    });
    const reversed = compareComponentAttributes({
      canonicalAttributes: index(sourceRows).get('source'),
      sourceAttributes: index(canonicalRows).get('canonical'),
    });

    expect(reversed[0]!.code).toBe(forward[0]!.code);
    expect(reversed[0]!.classification).toBe(forward[0]!.classification);
  });

  it('ignores free-text attributes, which are not reliable identity data', () => {
    const values = buildIdentityAttributeIndex([
      {
        componentId: 'canonical',
        attributeDefinitionId: 'def-mfr_part_number',
        code: 'mfr_part_number',
        label: 'Manufacturer Part Number',
        dataType: 'TEXT',
        numberValue: null,
        normalizedNumberValue: null,
        booleanValue: null,
        optionId: null,
        unit: null,
      },
    ]);

    expect(values.size).toBe(0);
  });
});
