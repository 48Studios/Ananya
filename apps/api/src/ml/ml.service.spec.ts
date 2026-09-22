import { Test, TestingModule } from '@nestjs/testing';
import {
  MlService,
  composeComponentDescription,
  composeComponentName,
  extractManufacturerPartNumber,
  normalizeExtractedUnit,
  resolveAttributeDefinition,
} from './ml.service';
import { MlClientService } from './ml-client.service';
import { DataPacksService } from '../data-packs/data-packs.service';
// The service reads its tables from `@ananya/database/schema` (a different module
// from the mocked `@ananya/database`), so the mock recognises the real table
// object rather than a stand-in. The `mock` prefix is what lets the hoisted
// `jest.mock` factory reference it.
import { categories as mockCategoriesTable } from '@ananya/database/schema';

/**
 * Category rows the mocked `categories` select returns.
 *
 * Empty by default, so the existing cases keep exercising the "the ERP holds
 * nothing that matches" path; a test that needs a taxonomy populates it with
 * {@link withCategories}.
 */
let categoryRows: Array<Record<string, unknown>> = [];

jest.mock('@ananya/database', () => {
  interface QueryMock {
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    then: (resolve: (val: unknown[]) => unknown) => Promise<unknown>;
  }

  /** The `categories` table stand-in, so `from()` can recognise it. */
  const categoriesTable = { isActive: 'isActive' };

  const makeQueryMock = (rows: () => unknown[] = () => []): QueryMock => {
    const res: QueryMock = {
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      then: (resolve: (val: unknown[]) => unknown) =>
        Promise.resolve(rows()).then(resolve),
    };
    res.where.mockReturnValue(res);
    res.orderBy.mockReturnValue(res);
    res.limit.mockReturnValue(res);
    return res;
  };

  return {
    db: {
      select: jest.fn().mockImplementation(() => ({
        from: jest
          .fn()
          .mockImplementation((table: unknown) =>
            makeQueryMock(
              table === mockCategoriesTable ? () => categoryRows : undefined,
            ),
          ),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockResolvedValue({ rowCount: 1 }),
      })),
    },
    categories: categoriesTable,
    manufacturers: { isActive: 'isActive' },
    attributeDefinitions: {},
    components: {},
    aiSuggestionFeedback: {},
    eq: jest.fn(),
  };
});

/** The live library's shape: a root group with the part families beneath it. */
const ELEC_ROW = {
  id: 'cat-elec',
  code: 'ELEC',
  name: 'Electronic Components',
  description: null,
  parentId: null,
  isActive: true,
};
const CAP_ROW = {
  id: 'cat-cap',
  code: 'CAP',
  name: 'Capacitors',
  description: null,
  parentId: 'cat-elec',
  isActive: true,
};
const RES_CHILD_ROW = {
  id: 'cat-res',
  code: 'RES',
  name: 'Resistors',
  description: null,
  parentId: 'cat-elec',
  isActive: true,
};
const RES_ROOT_ROW = {
  id: 'cat-res-root',
  code: 'RESISTORS',
  name: 'Resistors',
  description: null,
  parentId: null,
  isActive: true,
};

function withCategories(rows: Array<Record<string, unknown>>): void {
  categoryRows = rows;
}

describe('MlService', () => {
  let service: MlService;
  let clientMock: jest.Mocked<Partial<MlClientService>>;
  let packsMock: { getActiveIntelligenceHints: jest.Mock };

  beforeEach(async () => {
    withCategories([]);
    clientMock = {
      enabled: true,
      suggest: jest.fn(),
      health: jest.fn().mockResolvedValue(true),
      suggestAttributeBindings: jest.fn().mockResolvedValue(null),
      suggestCategoryAttributes: jest.fn().mockResolvedValue(null),
      suggestAttributeConfig: jest.fn().mockResolvedValue(null),
      detectAttributeDuplicates: jest.fn().mockResolvedValue(null),
      suggestEnumValues: jest.fn().mockResolvedValue(null),
      auditAttributeLibrary: jest.fn().mockResolvedValue(null),
    };
    packsMock = { getActiveIntelligenceHints: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MlService,
        {
          provide: MlClientService,
          useValue: clientMock,
        },
        {
          provide: DataPacksService,
          useValue: packsMock,
        },
      ],
    }).compile();

    service = module.get<MlService>(MlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('extracts the MPN without manufacturer or product suffixes', () => {
    expect(
      extractManufacturerPartNumber('RC0805FR-0727RL-YAGEO-SMD Chip Resistor', [
        { name: 'Yageo', code: 'YAGEO' },
      ]),
    ).toBe('RC0805FR-0727RL');
  });

  it('preserves milli-watt units and resolves ML attribute aliases', () => {
    expect(normalizeExtractedUnit('power', 'MW')).toBe('mW');
    expect(
      resolveAttributeDefinition('power', [
        { id: 'power-id', code: 'power_rating', name: 'Power Rating' },
      ])?.id,
    ).toBe('power-id');
  });

  it('composes singular component prose from extracted facts', () => {
    const attributes = {
      resistance: { formatted: '27Ω' },
      tolerance: { formatted: '1%' },
      power: { formatted: '125mW' },
      package: { formatted: '0805' },
    } as never;
    const category = {
      categoryName: 'Electronic Components',
      subcategoryName: 'Resistors',
    } as never;

    expect(composeComponentName(attributes, category, 'SMD thick film')).toBe(
      '27Ω 0805 SMD Thick Film Resistor',
    );
    expect(
      composeComponentDescription(
        attributes,
        category,
        'SMD thick film general purpose',
      ),
    ).toContain('125mW');
  });

  it('should resolve suggestion using microservice response when online', async () => {
    (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
      category_predictions: [
        {
          category: 'Electronic Components',
          subcategory: 'Resistors',
          resolution: 'EXISTING',
          category_id: 'cat-resistors',
          category_code: 'RESISTORS',
          category_path: ['Electronic Components', 'Resistors'],
          parent_category_id: 'cat-electronics',
          confidence: 0.95,
          candidates: [
            {
              category_id: 'cat-resistors',
              category_name: 'Resistors',
              category_code: 'RESISTORS',
              category_path: ['Electronic Components', 'Resistors'],
              confidence: 0.95,
              evidence: [],
            },
          ],
        },
      ],
      manufacturer: {
        manufacturer: 'Yageo',
        confidence: 0.99,
        match_type: 'pattern',
      },
      duplicates: {
        is_duplicate: false,
        matches: [],
      },
      extracted_attributes: {
        resistance: {
          code: 'resistance',
          value: 10000,
          unit: 'ohm',
          formatted: '10kΩ',
          confidence: 0.95,
        },
      },
      execution_time_ms: 2.5,
    });

    const result = await service.suggest({
      query: 'RC0805FR-0710KL 10k resistor',
    });

    expect(result).toBeDefined();
    expect(result.category?.subcategoryName).toBe('Resistors');
    expect(result.category?.resolution).toBe('EXISTING');
    expect(result.category?.categoryId).toBe('cat-resistors');
    expect(result.category?.categoryPath).toEqual([
      'Electronic Components',
      'Resistors',
    ]);
    expect(result.category?.candidates?.[0]?.categoryName).toBe('Resistors');
    expect(result.manufacturer?.resolution).toBe('NEW_CANDIDATE');
    expect(result.manufacturer?.manufacturerName).toBe('Yageo');
    expect(result.attributes['resistance']?.value).toBe(10000);
    expect(result.isMlActive).toBe(true);
  });

  it('should gracefully degrade to deterministic fallback when ML microservice returns null', async () => {
    (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);

    const result = await service.suggest({
      query: 'RC0805FR-0710KL 10k resistor 50V',
    });

    expect(result).toBeDefined();
    expect(result.isMlActive).toBe(false);
    expect(result.category?.subcategoryName).toBe('Resistors');
    expect(result.category?.evidence?.length).toBeGreaterThan(0);
    expect(result.manufacturer?.resolution).toBe('UNKNOWN');
    expect(result.manufacturer?.manufacturerName).toBeNull();
    expect(result.attributes['resistance']?.value).toBe(10000);
    expect(result.attributes['voltage']?.value).toBe(50);
    expect(result.confidenceLevel).toBeDefined();
    expect(result.overallEvidence?.length).toBeGreaterThan(0);
  });

  /**
   * The live payload shape: the ML names the group in `category` and the family
   * in `subcategory`, and resolves the family to a real ERP row.
   *
   * Regression: the group name used to be matched at the same priority as the
   * family name, so every capacitor, inductor and diode suggestion resolved to
   * the "Electronic Components" parent — the value the reviewer saw in the form's
   * Category field and the category the review queue would then apply.
   */
  it('resolves a family suggestion to the family, never to its parent group', async () => {
    withCategories([ELEC_ROW, CAP_ROW]);
    (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
      category_predictions: [
        {
          category: 'Electronic Components',
          subcategory: 'Capacitors',
          resolution: 'EXISTING',
          category_id: CAP_ROW.id,
          category_code: CAP_ROW.code,
          category_path: ['Electronic Components', 'Capacitors'],
          parent_category_id: ELEC_ROW.id,
          confidence: 0.99,
          confidence_level: 'HIGH',
        },
      ],
      manufacturer: { manufacturer: null, confidence: 0, match_type: 'none' },
      duplicates: { is_duplicate: false, matches: [] },
      extracted_attributes: {},
      execution_time_ms: 1,
    });

    const result = await service.suggest({ query: '100nF 50V X7R Capacitor' });

    expect(result.category?.categoryId).toBe(CAP_ROW.id);
    expect(result.category?.categoryCode).toBe('CAP');
    expect(result.category?.categoryId).not.toBe(ELEC_ROW.id);
    // The parent is the family's parent, never the family itself.
    expect(result.category?.parentCategoryId).toBe(ELEC_ROW.id);
    expect(result.category?.parentCategoryId).not.toBe(CAP_ROW.id);
    expect(result.category?.categoryPath).toEqual([
      'Electronic Components',
      'Capacitors',
    ]);
  });

  it('prefers the Data Pack category when two categories share a name', async () => {
    // The live library holds two "Resistors" rows: the pack's family category
    // under Electronic Components, and an empty root duplicate the ML happened
    // to resolve to.
    withCategories([ELEC_ROW, RES_ROOT_ROW, RES_CHILD_ROW]);
    packsMock.getActiveIntelligenceHints.mockResolvedValue([
      { categoryCode: 'RES', categoryName: 'Resistors' },
    ]);
    (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
      category_predictions: [
        {
          category: 'Resistors',
          subcategory: null,
          resolution: 'EXISTING',
          category_id: RES_ROOT_ROW.id,
          category_code: RES_ROOT_ROW.code,
          category_path: ['Resistors'],
          parent_category_id: null,
          confidence: 0.99,
          confidence_level: 'HIGH',
        },
      ],
      manufacturer: { manufacturer: null, confidence: 0, match_type: 'none' },
      duplicates: { is_duplicate: false, matches: [] },
      extracted_attributes: {},
      execution_time_ms: 1,
    });

    const result = await service.suggest({ query: '10k Ohm 0805 Resistor' });

    expect(result.category?.categoryId).toBe(RES_CHILD_ROW.id);
    expect(result.category?.categoryCode).toBe('RES');
    expect(result.category?.parentCategoryId).toBe(ELEC_ROW.id);
    // The path describes the row that was kept, not the one the ML named: the
    // root duplicate's path would otherwise sit beside the family's code.
    expect(result.category?.categoryPath).toEqual([
      'Electronic Components',
      'Resistors',
    ]);
  });

  it('resolves the deterministic fallback through the same rule', async () => {
    withCategories([ELEC_ROW, RES_ROOT_ROW, RES_CHILD_ROW]);
    packsMock.getActiveIntelligenceHints.mockResolvedValue([
      { categoryCode: 'RES', categoryName: 'Resistors' },
    ]);
    (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);

    const result = await service.suggest({
      query: 'RC0805FR-0710KL 10k resistor 50V',
    });

    expect(result.isMlActive).toBe(false);
    expect(result.category?.subcategoryName).toBe('Resistors');
    // The fallback named the family; the pack decides which row that is.
    expect(result.category?.categoryId).toBe(RES_CHILD_ROW.id);
    expect(result.category?.parentCategoryId).toBe(ELEC_ROW.id);
  });

  it('should record human feedback telemetry in the aiSuggestionFeedback table', async () => {
    const feedbackResult = await service.recordFeedback(
      {
        componentId: 'comp-123',
        creationContext: { sku: 'RC0805FR-0710KL', name: '10k resistor' },
        items: [
          {
            suggestionType: 'CATEGORY',
            field: 'category',
            predictedValue: 'Resistors',
            confidence: 0.95,
            confidenceLevel: 'HIGH',
            userAction: 'ACCEPTED',
            finalValue: 'Resistors',
          },
          {
            suggestionType: 'MANUFACTURER',
            field: 'manufacturer',
            predictedValue: 'Generic',
            confidence: 0.5,
            confidenceLevel: 'LOW',
            userAction: 'EDITED',
            finalValue: 'Yageo',
          },
        ],
      },
      { id: 'usr-1', email: 'engineer@48studios.com' },
    );

    expect(feedbackResult.success).toBe(true);
    expect(feedbackResult.recordedCount).toBe(2);
  });

  it('should export feedback dataset for model evaluation and retraining', async () => {
    const exportResult = await service.exportFeedbackDataset({
      suggestionType: 'CATEGORY',
      userAction: 'ACCEPTED',
    });

    expect(exportResult).toBeDefined();
    expect(exportResult.dataset).toBeInstanceOf(Array);
    expect(typeof exportResult.count).toBe('number');
  });

  it('should suggest attribute bindings via deterministic fallback', async () => {
    const result = await service.suggestAttributeBindings({
      attributeName: 'Voltage Rating',
      attributeCode: 'voltage_rating',
      dataType: 'QUANTITY',
      unitCategory: 'Voltage',
    });

    expect(result).toBeDefined();
    expect(result.suggestions).toBeInstanceOf(Array);
    expect(typeof result.executionTimeMs).toBe('number');
  });

  it('should suggest attribute configuration with canonical match', async () => {
    const result = await service.suggestAttributeConfig({
      name: 'Rated Voltage',
    });

    expect(result).toBeDefined();
    expect(result.suggestion.suggestedDataType).toBe('QUANTITY');
    expect(result.suggestion.unitCategory).toBe('Voltage');
    expect(result.suggestion.defaultUnit).toBe('V');
    expect(result.suggestion.displayUnits).toContain('kV');
    expect(result.suggestion.confidenceLevel).toBe('HIGH');
  });

  it('should detect duplicate attributes and suggest aliases', async () => {
    const result = await service.detectAttributeDuplicates({
      name: 'Voltage Rating',
    });

    expect(result).toBeDefined();
    expect(typeof result.isDuplicate).toBe('boolean');
    expect(result.matches).toBeInstanceOf(Array);
    expect(result.suggestedAliases).toBeInstanceOf(Array);
  });

  it('should suggest enum options for SELECT attributes', async () => {
    const result = await service.suggestEnumValues({
      attributeCode: 'dielectric',
      attributeName: 'Dielectric',
    });

    expect(result).toBeDefined();
    expect(result.suggestedOptions.length).toBeGreaterThan(0);
    expect(result.suggestedOptions.some((o) => o.code === 'X7R')).toBe(true);
  });

  it('should audit attribute library and return summary and issues', async () => {
    const result = await service.auditAttributeLibrary();

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.totalAttributes).toBe('number');
    expect(result.issues).toBeInstanceOf(Array);
  });

  it('should record attribute review queue feedback telemetry', async () => {
    const result = await service.recordFeedback(
      {
        attributeDefinitionId: 'attr-123',
        categoryId: 'cat-456',
        items: [
          {
            suggestionType: 'SUGGESTED_BINDING',
            field: 'queue_item',
            userAction: 'ACCEPTED',
            predictedValue: 'Bind attribute to category',
            finalValue: 'Bind attribute to category',
            confidenceLevel: 'HIGH',
          },
          {
            suggestionType: 'ENUM_OPTION',
            field: 'option_value',
            userAction: 'ACCEPTED',
            predictedValue: 'Active Low',
            finalValue: 'Active Low',
            confidenceLevel: 'HIGH',
          },
        ],
      },
      { id: 'usr-1', email: 'engineer@48studios.com' },
    );

    expect(result.success).toBe(true);
    expect(result.recordedCount).toBe(2);
  });
});
