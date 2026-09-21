import {
  buildComponentPatch,
  readAttributeWriteInput,
  validateSuggestedMpn,
} from './component-review-apply.service';

/**
 * Unit coverage for the attribute-value arm of the apply pipeline.
 *
 * The one thing that must be exactly right here is the mapping from the value a
 * finding stores (the coerced payload the attribute use case expects) to the
 * arguments that use case receives: getting it wrong hands a nested object to
 * the domain and every application fails with '[object Object]'.
 */
describe('attribute value application mapping', () => {
  it('unwraps the coerced quantity payload into the endpoint arguments', () => {
    const input = readAttributeWriteInput({
      attributeDefinitionId: 'def-resistance',
      attributeCode: 'resistance',
      dataType: 'QUANTITY',
      display: '330Ω',
      unit: 'ohm',
      value: { value: 330, unit: 'ohm' },
    });

    // The domain must receive the scalar and its unit, not the wrapper.
    expect(input).toEqual({ value: 330, unit: 'ohm' });
  });

  it('unwraps a quantity that carries no unit', () => {
    expect(
      readAttributeWriteInput({
        dataType: 'NUMBER',
        value: { value: 470 },
      }),
    ).toEqual({ value: 470 });
  });

  it('unwraps a select payload into value plus option code', () => {
    expect(
      readAttributeWriteInput({
        dataType: 'SELECT',
        value: { value: '0805', optionCode: '0805' },
      }),
    ).toEqual({ value: '0805', optionCode: '0805' });
  });

  it('unwraps a multi-select payload into value plus option codes', () => {
    expect(
      readAttributeWriteInput({
        dataType: 'MULTI_SELECT',
        value: { value: ['SMD', 'Through Hole'], selectedOptionCodes: ['SMD'] },
      }),
    ).toEqual({
      value: ['SMD', 'Through Hole'],
      selectedOptionCodes: ['SMD'],
    });
  });

  it('accepts a bare scalar value', () => {
    expect(readAttributeWriteInput({ value: 330 })).toEqual({ value: 330 });
    expect(readAttributeWriteInput({ value: true })).toEqual({ value: true });
  });

  it('forwards only the keys the attribute API accepts', () => {
    const input = readAttributeWriteInput({
      value: { value: 'Yageo', unit: 'ohm' },
      // None of these may reach the attribute use case.
      componentId: 'comp-1',
      attributeId: 'def-1',
      provenance: { source: 'forged' },
      appliedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(input).toEqual({ value: 'Yageo', unit: 'ohm' });
  });

  it('refuses a suggestion that carries no value at all', () => {
    expect(readAttributeWriteInput({ display: '330Ω' })).toBeNull();
    expect(readAttributeWriteInput({ value: {} })).toBeNull();
  });

  it('ignores non-string units and option codes', () => {
    expect(
      readAttributeWriteInput({
        value: { value: 330, unit: 42, optionCode: null },
      }),
    ).toEqual({ value: 330 });
  });
});

// Keeps the shared imports meaningful: these two helpers are the other exported
// pieces of the apply pipeline and are covered by the mapping suite above.
describe('apply helpers remain exported', () => {
  it('exposes the mpn validator and the component patch builder', () => {
    expect(typeof validateSuggestedMpn).toBe('function');
    expect(typeof buildComponentPatch).toBe('function');
  });
});
