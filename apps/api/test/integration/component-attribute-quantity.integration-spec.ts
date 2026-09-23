import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { MlClientService } from '../../src/ml/ml-client.service';
import { MlService } from '../../src/ml/ml.service';
import type { AttributeSuggestionDto } from '../../src/ml/dtos';
import { ComponentsService } from '../../src/components/components.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { AttributesService } from '../../src/attributes/attributes.service';
import { DataPacksService } from '../../src/data-packs/data-packs.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import { componentAttributeValues } from '@ananya/database/schema';
import { inArray } from '@ananya/database/query';

/**
 * AI quantity suggestions keep their physical quantity, end to end.
 *
 * The rule matrix lives in `attribute-value-semantics.spec.ts` and the
 * suggestion-level behaviour in `component-attribute-relevance.spec.ts`. What
 * this suite proves is the part that only exists once a real unit catalog, real
 * attribute definitions and real persistence are involved:
 *
 *  - `100 kΩ` is suggested as `100 kohm` (not `100000 ohm`) and is *recorded* as
 *    `100 kohm`, so the representation the document used survives;
 *  - `10 °C` against an attribute that requires `°F` is recorded as `50 °F`, and
 *    never as `10 °F`;
 *  - a unit of another dimension, or a number with no unit, produces no value at
 *    all and says why;
 *  - the match/conflict verdict compares physical quantities, so `10 °C` matches
 *    a recorded `50 °F` and conflicts with a recorded `10 °F`.
 *
 * The ML service is stubbed at the `MlClientService` boundary — extraction
 * quality is the Python suite's business, while everything Ananya owns
 * (resolution, conversion, persistence, comparison) is exercised against a real
 * database.
 */
describe('AI quantity suggestions preserve the physical quantity', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  const runTag = Math.random().toString(36).slice(2, 8).toUpperCase();

  let app: INestApplicationContext;
  let mlClient: MlClientService;
  let mlService: MlService;
  let componentsService: ComponentsService;
  let categoriesService: CategoriesService;
  let attributesService: AttributesService;
  let dataPacksService: DataPacksService;

  let categoryId = '';
  /** Resistance: the pack's definition, `ohm` by default, all ohms accepted. */
  let resistanceDefinitionId = '';
  /** Temperature fixed to `°F`: a single-entry `allowedUnits` rule. */
  let fahrenheitDefinitionId = '';
  /** Temperature that accepts the whole dimension, so `°C` is preserved. */
  let celsiusDefinitionId = '';
  /**
   * The codes the temperature extractions are reported under.
   *
   * An extracted property is resolved to a definition by its own code (see
   * `resolveAttributeDefinition`), so the fixture definitions carry the codes the
   * stub names. They are unique per run, which also keeps them out of the way of
   * the shared library the other suites analyse.
   */
  const fahrenheitCode = `p9_temp_f_${runTag}`.toLowerCase();
  const celsiusCode = `p9_temp_c_${runTag}`.toLowerCase();
  const ohmOnlyCode = `p9_ohm_fixed_${runTag}`.toLowerCase();
  /** Resistance fixed to `ohm`: the multiplicative conversion case. */
  let ohmOnlyDefinitionId = '';

  const createdComponentIds: string[] = [];
  const createdDefinitionIds: string[] = [];

  /** A raw extraction attribute as the ML layer reports it. */
  function extraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      code: 'resistance',
      value: 100000,
      unit: 'ohm',
      source_value: 100,
      source_unit: 'kΩ',
      formatted: '100kΩ',
      confidence: 0.95,
      confidence_level: 'HIGH',
      evidence: [
        {
          type: 'datasheet_param',
          description: 'Extracted resistance rating 100kΩ',
          weight: 0.95,
          source: 'extractor:ee_regex',
        },
      ],
      ...overrides,
    };
  }

  /**
   * Stubs the model service's reply.
   *
   * The attribute-suggestion endpoint is stubbed to `null` (its own contribution
   * is covered by the Python suite) so the local rules are the only source of
   * values and the assertions describe this repository's own behaviour.
   */
  function stubExtraction(attributes: Record<string, unknown>) {
    jest.spyOn(mlClient, 'suggest').mockResolvedValue({
      category_predictions: [],
      manufacturer: {
        resolution: 'UNKNOWN',
        manufacturer: null,
        confidence: 0,
        match_type: 'stub',
      },
      duplicates: { is_duplicate: false, matches: [] },
      extracted_attributes: attributes,
      confidence_level: 'HIGH',
      overall_evidence: [],
      execution_time_ms: 1,
    } as never);
    jest.spyOn(mlClient, 'suggestComponentAttributes').mockResolvedValue(null);
  }

  /** One suggestion from a `suggest()` reply, by definition id. */
  async function suggestFor(
    componentId: string | undefined,
    code: string,
  ): Promise<AttributeSuggestionDto> {
    const response = await mlService.suggest({
      query: 'RC0805FR-0710KL resistor',
      categoryId,
      ...(componentId ? { componentId } : {}),
    });
    const suggestion = response.attributeSuggestions.find(
      (entry) => entry.code === code,
    );
    if (!suggestion) {
      throw new Error(
        `expected a suggestion for ${code}, got ${response.attributeSuggestions
          .map((entry) => entry.code)
          .join(', ')}`,
      );
    }
    return suggestion;
  }

  /** Records a suggestion through the same payload the form saves. */
  async function applySuggestion(
    suggestion: AttributeSuggestionDto,
    label: string,
  ): Promise<string> {
    if (!suggestion.suggestedValue) {
      throw new Error(
        `suggestion for ${suggestion.code} has no value to apply`,
      );
    }
    const component = await componentsService.create({
      sku: `E2E-AQ-${runTag}-${label}`,
      name: `Quantity fixture ${runTag} ${label}`,
      unit: 'pcs',
      attributes: [
        {
          attributeDefinitionId: suggestion.attributeDefinitionId,
          value: suggestion.suggestedValue.value,
          ...(suggestion.suggestedValue.unit
            ? { unit: suggestion.suggestedValue.unit }
            : {}),
        },
      ],
    });
    createdComponentIds.push(component.id);
    return component.id;
  }

  /** The persisted value of one attribute on a component. */
  async function recordedValue(
    componentId: string,
    code: string,
  ): Promise<{
    value: unknown;
    unit: string | null;
    display: string;
    normalized: unknown;
  }> {
    const attributes =
      await attributesService.getComponentAttributes(componentId);
    const entry = attributes[code];
    if (!entry) {
      throw new Error(`component does not record ${code}`);
    }
    return {
      value: entry.value,
      unit: entry.unit,
      display: entry.displayValue,
      normalized: entry.normalizedValue,
    };
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    mlClient = app.get(MlClientService);
    mlService = app.get(MlService);
    componentsService = app.get(ComponentsService);
    categoriesService = app.get(CategoriesService);
    attributesService = app.get(AttributesService);
    dataPacksService = app.get(DataPacksService);

    // The pack supplies the resistance definition and the units, including the
    // affine `°F` this suite converts into.
    await dataPacksService.installDataPack('electronics-smd');

    const definitions = await attributesService.getAllDefinitions();
    const resistance = definitions.find(
      (definition) => definition.code === 'resistance',
    );
    if (!resistance) {
      throw new Error('The electronics pack must define `resistance`.');
    }
    resistanceDefinitionId = resistance.id;

    const category = await categoriesService.create({
      code: `E2EAQ${runId}`,
      name: `E2E Attribute Quantity ${runId}`,
    });
    categoryId = category.id;

    await attributesService.assignCategoryAttribute(categoryId, {
      attributeDefinitionId: resistanceDefinitionId,
    });

    const fahrenheit = await attributesService.createDefinition({
      code: fahrenheitCode,
      name: `Operating Temperature F ${runTag}`,
      dataType: 'QUANTITY',
      unitCategory: 'Temperature',
      defaultUnit: '°F',
      // The explicit accepted set is what makes the unit *fixed*: the quantity
      // must be converted into °F rather than recorded in whatever unit it
      // arrived in.
      validationRules: { allowedUnits: ['°F'] },
    });
    createdDefinitionIds.push(fahrenheit.id);
    fahrenheitDefinitionId = fahrenheit.id;
    await attributesService.assignCategoryAttribute(categoryId, {
      attributeDefinitionId: fahrenheitDefinitionId,
    });

    const celsius = await attributesService.createDefinition({
      code: celsiusCode,
      name: `Operating Temperature C ${runTag}`,
      dataType: 'QUANTITY',
      unitCategory: 'Temperature',
      defaultUnit: '°C',
      // No `allowedUnits`: every unit of the declared dimension is accepted, so
      // the source unit is preserved.
    });
    createdDefinitionIds.push(celsius.id);
    celsiusDefinitionId = celsius.id;
    await attributesService.assignCategoryAttribute(categoryId, {
      attributeDefinitionId: celsiusDefinitionId,
    });

    const ohmOnly = await attributesService.createDefinition({
      code: ohmOnlyCode,
      name: `Resistance in ohms ${runTag}`,
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
      validationRules: { allowedUnits: ['ohm'] },
    });
    createdDefinitionIds.push(ohmOnly.id);
    ohmOnlyDefinitionId = ohmOnly.id;
    await attributesService.assignCategoryAttribute(categoryId, {
      attributeDefinitionId: ohmOnlyDefinitionId,
    });
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    // Attribute values are removed by component id before the components, so a
    // value written for a fixture that was already deleted cannot be orphaned.
    if (createdComponentIds.length > 0) {
      await db
        .delete(componentAttributeValues)
        .where(
          inArray(componentAttributeValues.componentId, createdComponentIds),
        )
        .catch(() => undefined);
    }
    for (const componentId of createdComponentIds) {
      await componentsService.delete(componentId).catch(() => undefined);
    }
    for (const definitionId of createdDefinitionIds) {
      await attributesService
        .deleteDefinition(definitionId)
        .catch(() => undefined);
    }
    if (categoryId) {
      await categoriesService.delete(categoryId).catch(() => undefined);
    }
    await closeDatabaseConnection().catch(() => undefined);
  });

  describe('multiplicative units', () => {
    it('suggests 100 kΩ as 100 kohm, not as 100000 ohm', async () => {
      stubExtraction({ resistance: extraction() });

      const suggestion = await suggestFor(undefined, 'resistance');

      expect(suggestion.suggestedValue).toMatchObject({
        value: 100,
        unit: 'kohm',
        formatted: '100kΩ',
      });
    });

    it('records the suggested quantity and keeps the ohm-equivalent normalised', async () => {
      stubExtraction({ resistance: extraction() });
      const suggestion = await suggestFor(undefined, 'resistance');
      const componentId = await applySuggestion(suggestion, 'preserved');

      const recorded = await recordedValue(componentId, 'resistance');

      expect(recorded.value).toBe(100);
      expect(recorded.unit).toBe('kohm');
      expect(recorded.display).toBe('100 kohm');
      // The canonical column is the same physical quantity, so nothing is lost
      // by storing the value in the unit the document used.
      expect(Number(recorded.normalized)).toBe(100000);
    });

    it('converts into the unit an attribute fixes, never copying the number', async () => {
      // A definition that accepts only `ohm` has to convert. The extraction is
      // reported under this fixture's own code, which is what resolves it to
      // this definition rather than to the library's `resistance`.
      stubExtraction({
        [ohmOnlyCode]: extraction({
          code: ohmOnlyCode,
          formatted: '100kΩ',
        }),
      });
      const response = await mlService.suggest({
        query: 'RC0805FR-0710KL resistor',
        categoryId,
      });
      const suggestion = response.attributeSuggestions.find(
        (entry) => entry.attributeDefinitionId === ohmOnlyDefinitionId,
      );

      // 100 kΩ is 100000 Ω: the number changed because the quantity was
      // converted, which is the opposite of copying `100` under a new unit.
      expect(suggestion?.suggestedValue).toMatchObject({
        value: 100000,
        unit: 'ohm',
        formatted: '100kΩ',
      });
    });
  });

  describe('affine temperature', () => {
    it('converts 10 °C into 50 °F for an attribute that requires °F', async () => {
      stubExtraction({
        [fahrenheitCode]: {
          code: fahrenheitCode,
          value: 10,
          unit: '°C',
          source_value: 10,
          source_unit: '°C',
          formatted: '10°C',
          confidence: 0.9,
          confidence_level: 'HIGH',
          evidence: [],
        },
      });

      const response = await mlService.suggest({
        query: 'capacitor 10C',
        categoryId,
      });
      const fixed = response.attributeSuggestions.find(
        (entry) => entry.attributeDefinitionId === fahrenheitDefinitionId,
      );

      // The suggestion keeps the source representation for display while the
      // value it would record is the converted one.
      expect(fixed?.suggestedValue).toMatchObject({
        value: 50,
        unit: '°F',
        formatted: '10°C',
      });
    });
    it('records 50 °F and never 10 °F', async () => {
      stubExtraction({
        [fahrenheitCode]: {
          code: fahrenheitCode,
          value: 10,
          unit: '°C',
          source_value: 10,
          source_unit: '°C',
          formatted: '10°C',
          confidence: 0.9,
          confidence_level: 'HIGH',
          evidence: [],
        },
      });

      const response = await mlService.suggest({
        query: 'capacitor 10C',
        categoryId,
      });
      const fixed = response.attributeSuggestions.find(
        (entry) => entry.attributeDefinitionId === fahrenheitDefinitionId,
      )!;
      const componentId = await applySuggestion(fixed, 'fahrenheit');
      const recorded = await recordedValue(componentId, fixed.code);

      expect(recorded.value).toBe(50);
      expect(recorded.unit).toBe('°F');
      expect(recorded.display).toBe('50 °F');
      // 10 °C is 283.15 K; recorded in °F the base column holds the same
      // physical quantity, which is what a copied `10` could not do.
      expect(Number(recorded.normalized)).toBeCloseTo(10, 9);
    });

    it('preserves °C when the attribute accepts the whole dimension', async () => {
      stubExtraction({
        [celsiusCode]: {
          code: celsiusCode,
          value: 10,
          unit: '°C',
          source_value: 10,
          source_unit: '°C',
          formatted: '10°C',
          confidence: 0.9,
          confidence_level: 'HIGH',
          evidence: [],
        },
      });

      const response = await mlService.suggest({
        query: 'capacitor 10C',
        categoryId,
      });
      const selectable = response.attributeSuggestions.find(
        (entry) => entry.attributeDefinitionId === celsiusDefinitionId,
      );

      expect(selectable?.suggestedValue).toMatchObject({
        value: 10,
        unit: '°C',
      });
    });
  });

  describe('refusals', () => {
    it('withholds a quantity whose unit measures another dimension', async () => {
      stubExtraction({
        resistance: extraction({
          value: 10,
          unit: 'mV',
          source_value: 10,
          source_unit: 'mV',
          formatted: '10mV',
        }),
      });

      const suggestion = await suggestFor(undefined, 'resistance');

      expect(suggestion.suggestedValue).toBeNull();
      expect(suggestion.valueWithheldReason).toMatch(/incompatible/i);
      expect(suggestion.valueWithheldReason).toContain('mV');
    });

    it('withholds a number that arrived with no unit, never assuming the attribute’s', async () => {
      stubExtraction({
        resistance: extraction({
          value: 10,
          unit: null,
          source_value: null,
          source_unit: null,
          formatted: '10',
        }),
      });

      const suggestion = await suggestFor(undefined, 'resistance');

      expect(suggestion.suggestedValue).toBeNull();
      expect(suggestion.valueWithheldReason).toMatch(/no unit/i);
    });
  });

  describe('equivalence and conflicts', () => {
    it('reports a recorded 100000 ohm as matching a 100 kΩ suggestion', async () => {
      stubExtraction({ resistance: extraction() });
      const suggestion = await suggestFor(undefined, 'resistance');
      const componentId = await applySuggestion(suggestion, 'match');
      // Re-record the same quantity in the base unit, so the comparison has to
      // reconcile two representations of one quantity.
      await componentsService.update(componentId, {
        attributes: [{ code: 'resistance', value: 100000, unit: 'ohm' }],
      });

      stubExtraction({ resistance: extraction() });
      const compared = await suggestFor(componentId, 'resistance');

      expect(compared.existingDisplay).toBe('100000 ohm');
      expect(compared.existingMatches).toBe(true);
      expect(compared.conflict).toBeNull();
    });

    it('reports a recorded 100 ohm as conflicting with a 100 kΩ suggestion', async () => {
      stubExtraction({ resistance: extraction() });
      const suggestion = await suggestFor(undefined, 'resistance');
      const componentId = await applySuggestion(suggestion, 'conflict');
      await componentsService.update(componentId, {
        attributes: [{ code: 'resistance', value: 100, unit: 'ohm' }],
      });

      stubExtraction({ resistance: extraction() });
      const compared = await suggestFor(componentId, 'resistance');

      expect(compared.conflict).not.toBeNull();
      expect(compared.existingMatches).toBe(false);
    });

    it('treats a recorded 50 °F as equal to a suggested 10 °C', async () => {
      const temperature = {
        code: fahrenheitCode,
        value: 10,
        unit: '°C',
        source_value: 10,
        source_unit: '°C',
        formatted: '10°C',
        confidence: 0.9,
        confidence_level: 'HIGH',
        evidence: [],
      };

      stubExtraction({ [fahrenheitCode]: temperature });
      const response = await mlService.suggest({
        query: 'capacitor 10C',
        categoryId,
      });
      const fixed = response.attributeSuggestions.find(
        (entry) => entry.attributeDefinitionId === fahrenheitDefinitionId,
      )!;
      const componentId = await applySuggestion(fixed, 'temp-match');
      await componentsService.update(componentId, {
        attributes: [{ code: fixed.code, value: 50, unit: '°F' }],
      });

      stubExtraction({ [fahrenheitCode]: temperature });
      const compared = await suggestFor(componentId, fixed.code);

      expect(compared.existingDisplay).toBe('50 °F');
      expect(compared.existingMatches).toBe(true);
      expect(compared.conflict).toBeNull();
    });

    it('treats a recorded 10 °F as conflicting with a suggested 10 °C', async () => {
      const temperature = {
        code: fahrenheitCode,
        value: 10,
        unit: '°C',
        source_value: 10,
        source_unit: '°C',
        formatted: '10°C',
        confidence: 0.9,
        confidence_level: 'HIGH',
        evidence: [],
      };

      stubExtraction({ [fahrenheitCode]: temperature });
      const response = await mlService.suggest({
        query: 'capacitor 10C',
        categoryId,
      });
      const fixed = response.attributeSuggestions.find(
        (entry) => entry.attributeDefinitionId === fahrenheitDefinitionId,
      )!;
      const componentId = await applySuggestion(fixed, 'temp-conflict');
      // 10 °F is −12.2 °C: the same number in the other unit is a different
      // quantity, and that difference is exactly what must be visible.
      await componentsService.update(componentId, {
        attributes: [{ code: fixed.code, value: 10, unit: '°F' }],
      });

      stubExtraction({ [fahrenheitCode]: temperature });
      const compared = await suggestFor(componentId, fixed.code);

      expect(compared.conflict).not.toBeNull();
      expect(compared.existingMatches).toBe(false);
    });
  });
});
