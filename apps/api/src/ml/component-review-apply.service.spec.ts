import {
  buildComponentPatch,
  validateSuggestedMpn,
} from './component-review-apply.service';
import {
  APPLICABLE_FINDING_TYPES,
  COMPONENT_APPLY_RULES,
  isApplicableFindingType,
  resolveApplyRule,
  type ApplicableFindingType,
} from './component-review-apply.dtos';

const PACKAGE_PATTERNS = ['0201', '0402', '0603', '0805', '1206', 'SOT-23'];

describe('Component apply rule mapping', () => {
  it('maps exactly the six supported finding types to one field each', () => {
    expect([...APPLICABLE_FINDING_TYPES]).toEqual([
      'MPN_MISSING',
      'MPN_CONFLICT',
      'MANUFACTURER_UNRESOLVED',
      'MANUFACTURER_CONFLICT',
      'CATEGORY_UNRESOLVED',
      'CATEGORY_CONFLICT',
    ]);

    expect(COMPONENT_APPLY_RULES.MPN_MISSING.field).toBe(
      'manufacturerPartNumber',
    );
    expect(COMPONENT_APPLY_RULES.MPN_CONFLICT.field).toBe(
      'manufacturerPartNumber',
    );
    expect(COMPONENT_APPLY_RULES.MANUFACTURER_UNRESOLVED.field).toBe(
      'manufacturerId',
    );
    expect(COMPONENT_APPLY_RULES.MANUFACTURER_CONFLICT.field).toBe(
      'manufacturerId',
    );
    expect(COMPONENT_APPLY_RULES.CATEGORY_UNRESOLVED.field).toBe('categoryId');
    expect(COMPONENT_APPLY_RULES.CATEGORY_CONFLICT.field).toBe('categoryId');
  });

  it('treats duplicate findings as non-applicable', () => {
    expect(resolveApplyRule('EXACT_DUPLICATE')).toBeNull();
    expect(resolveApplyRule('POTENTIAL_DUPLICATE')).toBeNull();
    expect(isApplicableFindingType('EXACT_DUPLICATE')).toBe(false);
    expect(isApplicableFindingType('POTENTIAL_DUPLICATE')).toBe(false);
  });

  it('refuses any unknown finding type', () => {
    expect(resolveApplyRule('ATTRIBUTE_ANOMALY')).toBeNull();
    expect(resolveApplyRule('')).toBeNull();
    expect(isApplicableFindingType('SOME_FUTURE_TYPE')).toBe(false);
  });

  it('requires entity findings to resolve an ERP row and MPN findings not to', () => {
    expect(COMPONENT_APPLY_RULES.MPN_MISSING.kind).toBe('mpn');
    expect(COMPONENT_APPLY_RULES.MPN_CONFLICT.kind).toBe('mpn');
    for (const type of [
      'MANUFACTURER_UNRESOLVED',
      'MANUFACTURER_CONFLICT',
    ] as ApplicableFindingType[]) {
      expect(COMPONENT_APPLY_RULES[type].kind).toBe('entity');
      expect(COMPONENT_APPLY_RULES[type].entity).toBe('manufacturer');
    }
    for (const type of [
      'CATEGORY_UNRESOLVED',
      'CATEGORY_CONFLICT',
    ] as ApplicableFindingType[]) {
      expect(COMPONENT_APPLY_RULES[type].kind).toBe('entity');
      expect(COMPONENT_APPLY_RULES[type].entity).toBe('category');
    }
  });

  it('maps a finding type to exactly one component field', () => {
    const fields = Object.values(COMPONENT_APPLY_RULES).map(
      (rule) => rule.field,
    );
    // Three writable fields, two finding types each.
    expect(new Set(fields)).toEqual(
      new Set(['manufacturerPartNumber', 'manufacturerId', 'categoryId']),
    );
  });
});

describe('buildComponentPatch', () => {
  it('produces a single-field patch and never a field the client named', () => {
    expect(
      buildComponentPatch('manufacturerPartNumber', 'RC0805FR-0727RL'),
    ).toEqual({ manufacturerPartNumber: 'RC0805FR-0727RL' });
    expect(buildComponentPatch('manufacturerId', 'mfg-1')).toEqual({
      manufacturerId: 'mfg-1',
    });
    expect(buildComponentPatch('categoryId', 'cat-1')).toEqual({
      categoryId: 'cat-1',
    });
  });

  it('allows clearing a field only through an explicit null', () => {
    expect(buildComponentPatch('categoryId', null)).toEqual({
      categoryId: null,
    });
  });

  it('never includes unrelated component fields', () => {
    const patch = buildComponentPatch('manufacturerId', 'mfg-1');
    expect(Object.keys(patch)).toEqual(['manufacturerId']);
    for (const forbidden of [
      'sku',
      'name',
      'description',
      'unit',
      'isActive',
      'defaultLocationId',
    ]) {
      expect(patch).not.toHaveProperty(forbidden);
    }
  });
});

describe('validateSuggestedMpn', () => {
  const validate = (raw: unknown, componentSku = 'CMP-000003') =>
    validateSuggestedMpn({
      raw,
      componentSku,
      packagePatterns: PACKAGE_PATTERNS,
    });

  it('accepts well-formed manufacturer part numbers', () => {
    for (const mpn of [
      'RC0805FR-0727RL',
      'C0805C104K5RACTU',
      'LM358DR',
      'SSM3K35AMFV',
      '1N4148',
      'GRM188R71C104KA01D',
    ]) {
      const result = validate(mpn);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(mpn);
    }
  });

  it('rejects empty, non-string, and too-short values', () => {
    for (const raw of [null, undefined, '', '   ', 42, {}, [], 'AB1']) {
      expect(validate(raw).ok).toBe(false);
    }
  });

  it('rejects values that are not identifiers', () => {
    for (const raw of ['ABCDEF', '123456']) {
      expect(validate(raw).ok).toBe(false);
    }
  });

  it('rejects engineering measurements', () => {
    for (const measurement of ['125mW', '125MW', '1000V', '100mA', '10kHz']) {
      expect(validate(measurement).ok).toBe(false);
    }
  });

  it('rejects footprint codes', () => {
    for (const code of ['0805', '0603', 'SOT-23']) {
      expect(validate(code).ok).toBe(false);
    }
  });

  it('rejects placeholders', () => {
    for (const placeholder of ['NONE', 'TBD', 'UNKNOWN']) {
      expect(validate(placeholder).ok).toBe(false);
    }
  });

  it('rejects the component’s own internal SKU', () => {
    // Normalization makes CMP-000003 and cmp000003 the same value.
    expect(validate('CMP-000003').ok).toBe(false);
    expect(validate('cmp000003').ok).toBe(false);
    // A different SKU is still refused by the identifier guards, not this one.
    expect(validate('RC0805FR-0727RL', 'CMP-000003').ok).toBe(true);
  });

  it('trims the accepted value', () => {
    const result = validate('  RC0805FR-0727RL  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('RC0805FR-0727RL');
  });
});
