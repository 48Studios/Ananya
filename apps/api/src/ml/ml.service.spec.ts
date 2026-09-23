import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
import { components as mockComponentsTable } from '@ananya/database/schema';
import { attributeDefinitions as mockAttributeDefinitionsTable } from '@ananya/database/schema';
import { attributeOptions as mockAttributeOptionsTable } from '@ananya/database/schema';
import { categoryAttributes as mockCategoryAttributesTable } from '@ananya/database/schema';
import { componentAttributeValues as mockComponentAttributeValuesTable } from '@ananya/database/schema';

/**
 * Category rows the mocked `categories` select returns.
 *
 * Empty by default, so the existing cases keep exercising "the ERP holds
 * nothing that matches" path; a test that needs a taxonomy populates it with
 * {@link withCategories}.
 */
let categoryRows: Array<Record<string, unknown>> = [];

/**
 * Stored components the mocked `components` select returns — the duplicate
 * candidates. Empty by default; {@link withComponents} populates it.
 */
let componentRows: Array<Record<string, unknown>> = [];

/** The attribute catalog, the option catalog, the bindings and recorded values. */
let attributeDefinitionRows: Array<Record<string, unknown>> = [];
let attributeOptionRows: Array<Record<string, unknown>> = [];
let categoryAttributeRows: Array<Record<string, unknown>> = [];
let componentAttributeValueRows: Array<Record<string, unknown>> = [];

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
        from: jest.fn().mockImplementation((table: unknown) => {
          // Rows by table, never by query shape: the service's selects project a
          // subset of columns, and the mocked rows carry them all.
          if (table === mockCategoriesTable) {
            return makeQueryMock(() => categoryRows);
          }
          if (table === mockComponentsTable) {
            return makeQueryMock(() => componentRows);
          }
          if (table === mockAttributeDefinitionsTable) {
            return makeQueryMock(() => attributeDefinitionRows);
          }
          if (table === mockAttributeOptionsTable) {
            return makeQueryMock(() => attributeOptionRows);
          }
          if (table === mockCategoryAttributesTable) {
            return makeQueryMock(() => categoryAttributeRows);
          }
          if (table === mockComponentAttributeValuesTable) {
            return makeQueryMock(() => componentAttributeValueRows);
          }
          return makeQueryMock();
        }),
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

/**
 * The stored components duplicate detection compares against.
 *
 * `manufacturer_part_number` is deliberately not part of the row shape the
 * service selects, which is exactly why the detector cannot identify a
 * component by its MPN — see the exclusion tests below.
 */
function withComponents(rows: Array<Record<string, unknown>>): void {
  componentRows = rows;
}

/** The attribute catalog and the two catalogs the suggestion reads beside it. */
function withAttributeDefinitions(rows: Array<Record<string, unknown>>): void {
  attributeDefinitionRows = rows;
}

function withAttributeOptions(rows: Array<Record<string, unknown>>): void {
  attributeOptionRows = rows;
}

function withCategoryBindings(rows: Array<Record<string, unknown>>): void {
  categoryAttributeRows = rows;
}

/** The values a component already records, as the storage rows read back. */
function withComponentAttributeValues(
  rows: Array<Record<string, unknown>>,
): void {
  componentAttributeValueRows = rows;
}

/** The outbound model payload, as the service actually built it. */
function lastSuggestPayload(client: jest.Mocked<Partial<MlClientService>>): {
  datasheet_text?: string;
  datasheet_pdf_base64?: string;
  existing_components: Array<{
    id: string;
    sku?: string;
    manufacturer_part_number?: string;
  }>;
} {
  const calls = (client.suggest as jest.Mock).mock.calls as Array<[unknown]>;
  const last = calls[calls.length - 1];
  return (last?.[0] ?? {}) as {
    datasheet_text?: string;
    datasheet_pdf_base64?: string;
    existing_components: Array<{
      id: string;
      sku?: string;
      manufacturer_part_number?: string;
    }>;
  };
}

/** The payload the component-attribute call was made with, if it was made. */
function lastAttributePayload(
  client: jest.Mocked<Partial<MlClientService>>,
): Record<string, unknown> | null {
  const calls = (client.suggestComponentAttributes as jest.Mock).mock
    .calls as Array<[unknown]>;
  return calls.length > 0
    ? (calls[calls.length - 1]![0] as Record<string, unknown>)
    : null;
}

describe('MlService', () => {
  let service: MlService;
  let clientMock: jest.Mocked<Partial<MlClientService>>;
  let packsMock: { getActiveIntelligenceHints: jest.Mock };

  beforeEach(async () => {
    withCategories([]);
    withComponents([]);
    withAttributeDefinitions([]);
    withAttributeOptions([]);
    withCategoryBindings([]);
    withComponentAttributeValues([]);
    clientMock = {
      enabled: true,
      suggest: jest.fn(),
      health: jest.fn().mockResolvedValue(true),
      suggestAttributeBindings: jest.fn().mockResolvedValue(null),
      suggestCategoryAttributes: jest.fn().mockResolvedValue(null),
      suggestComponentAttributes: jest.fn().mockResolvedValue(null),
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
   * A component is never a duplicate of itself.
   *
   * Regression: the request carried no component identity, so editing a
   * component compared it against the whole catalog — including itself. Its own
   * name and specifications are the closest text to the query, so the reviewer
   * was shown "Potential Duplicate Component Detected" naming the very record
   * they had open.
   */
  describe('editing a component', () => {
    /** A row whose SKU is also the searched part number, so the ERP loop matches. */
    const SELF = {
      id: 'comp-self',
      sku: 'RC0805FR-0710KL',
      name: '10kΩ 0805 SMD Resistor',
      description: 'SMD thick film resistor',
    };
    /** A genuinely different record that happens to share the same SKU value. */
    const TWIN = {
      id: 'comp-twin',
      sku: 'RC0805FR-0710KL',
      name: 'Twin of the edited resistor',
      description: 'SMD thick film resistor',
    };

    beforeEach(() => {
      (clientMock.suggest as jest.Mock).mockResolvedValue({
        category_predictions: [],
        manufacturer: {
          manufacturer: null,
          resolution: 'UNKNOWN',
          confidence: 0,
          match_type: 'unresolved',
        },
        duplicates: { is_duplicate: false, matches: [] },
        extracted_attributes: {},
        execution_time_ms: 1,
      });
    });

    it('does not offer the edited component as its own duplicate', async () => {
      withComponents([SELF]);

      const result = await service.suggest({
        query: 'RC0805FR-0710KL 10k resistor',
        partNumber: 'RC0805FR-0710KL',
        componentId: SELF.id,
      });

      expect(result.duplicateWarnings).toEqual([]);
      expect(result.isDuplicate).toBe(false);
    });

    it('withholds the edited component from the model as well', async () => {
      withComponents([SELF]);

      await service.suggest({
        query: 'RC0805FR-0710KL 10k resistor',
        partNumber: 'RC0805FR-0710KL',
        componentId: SELF.id,
      });

      // The outbound call must not see it either: the model runs its own
      // semantic comparison over whatever candidate list it is handed.
      expect(lastSuggestPayload(clientMock).existing_components).toEqual([]);
    });

    it('still reports a different record that genuinely collides', async () => {
      withComponents([SELF, TWIN]);

      const result = await service.suggest({
        query: 'RC0805FR-0710KL 10k resistor',
        partNumber: 'RC0805FR-0710KL',
        componentId: SELF.id,
      });

      // Only the twin is excluded from being reported, never the whole search.
      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateWarnings.map((w) => w.sku)).toEqual([TWIN.sku]);
      expect(result.duplicateWarnings[0]?.matchType).toBe('exact_sku');
    });

    it('keeps every component as a candidate when creating a new one', async () => {
      withComponents([SELF, TWIN]);

      const result = await service.suggest({
        query: 'RC0805FR-0710KL 10k resistor',
        partNumber: 'RC0805FR-0710KL',
      });

      // No `componentId`: nothing is the reviewer's own record yet.
      expect(result.duplicateWarnings).toHaveLength(2);
      expect(lastSuggestPayload(clientMock).existing_components).toHaveLength(
        2,
      );
    });
  });

  /**
   * The candidate payload carries the part's real identity.
   *
   * Regression: `existing_components` was sent as `{id, sku, name, description}`.
   * `sku` is the ERP's own key (`CMP-000305`), so the detector compared every
   * searched part number against an internal identifier and never matched — which
   * made the authoritative tiers unreachable and left duplicate decisions to
   * fuzzy text overlap.
   */
  describe('duplicate candidates', () => {
    const STORED = {
      id: 'comp-1',
      sku: 'CMP-000305',
      name: 'Murata GRM21BR61C106KE15K Multilayer Ceramic Capacitor',
      description: '10uF 16V X7R 0805',
      manufacturerPartNumber: 'GRM21BR61C106KE15K',
    };

    beforeEach(() => {
      (clientMock.suggest as jest.Mock).mockResolvedValue({
        category_predictions: [],
        manufacturer: {
          manufacturer: null,
          resolution: 'UNKNOWN',
          confidence: 0,
          match_type: 'unresolved',
        },
        duplicates: { is_duplicate: false, matches: [] },
        extracted_attributes: {},
        execution_time_ms: 1,
      });
    });

    it('sends the manufacturer part number', async () => {
      withComponents([STORED]);

      await service.suggest({ query: 'GRM21BR61C106KE15K' });

      const [candidate] =
        lastSuggestPayload(clientMock).existing_components ?? [];
      expect(candidate?.manufacturer_part_number).toBe('GRM21BR61C106KE15K');
      // The ERP's own key still travels, but as the record's address rather than
      // as the thing a part number is matched against.
      expect(candidate?.sku).toBe('CMP-000305');
    });

    it('omits the field for a record that has no part number', async () => {
      withComponents([{ ...STORED, manufacturerPartNumber: null }]);

      await service.suggest({ query: 'anything' });

      const [candidate] =
        lastSuggestPayload(clientMock).existing_components ?? [];
      expect(candidate?.manufacturer_part_number).toBeUndefined();
    });
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

  /**
   * Attribute relevance and value inference.
   *
   * The behaviour under test is the wiring: which category conditions the
   * relevance, that the category's own bindings reach the response, that a value
   * is only produced from real evidence, and that a recorded value is never
   * silently overwritten. The rule matrix itself is covered exhaustively by
   * `component-attribute-relevance.spec.ts`.
   */
  describe('attribute suggestions', () => {
    const CONN_ROW = {
      id: 'cat-conn',
      code: 'CONN',
      name: 'Connectors',
      description: null,
      parentId: null,
      isActive: true,
    };
    const TERM_ROW = {
      id: 'cat-term',
      code: 'TERM',
      name: 'Terminal Blocks',
      description: null,
      parentId: null,
      isActive: true,
    };
    const PACKAGE_DEF = {
      id: 'def-package',
      code: 'package',
      name: 'Package / Case',
      dataType: 'SELECT',
      unitCategory: null,
      defaultUnit: null,
      aliases: [],
      isActive: true,
      validationRules: null,
    };
    const MOUNTING_DEF = {
      id: 'def-mounting',
      code: 'mounting_type',
      name: 'Mounting Type',
      dataType: 'SELECT',
      unitCategory: null,
      defaultUnit: null,
      aliases: [],
      isActive: true,
      validationRules: null,
    };
    const OPTION_ROWS = [
      {
        id: 'opt-0805',
        definitionId: 'def-package',
        code: '0805',
        label: '0805 (2012 Metric)',
      },
      {
        id: 'opt-smd',
        definitionId: 'def-mounting',
        code: 'SMD',
        label: 'Surface Mount (SMD/SMT)',
      },
      {
        id: 'opt-th',
        definitionId: 'def-mounting',
        code: 'Through Hole',
        label: 'Through Hole (THT)',
      },
    ];
    const CONNECTOR_BINDINGS = [
      {
        attributeDefinitionId: 'def-package',
        categoryId: CONN_ROW.id,
        isRequired: false,
        sortOrder: 1,
      },
      {
        attributeDefinitionId: 'def-mounting',
        categoryId: CONN_ROW.id,
        isRequired: false,
        sortOrder: 2,
      },
    ];

    /** The model classifying a part as a connector and reading a 0805 package. */
    function stubConnectorSuggestion(): void {
      (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
        category_predictions: [
          {
            category: CONN_ROW.name,
            resolution: 'EXISTING',
            category_id: CONN_ROW.id,
            category_code: CONN_ROW.code,
            category_path: [CONN_ROW.name],
            confidence: 0.98,
            confidence_level: 'HIGH',
          },
        ],
        manufacturer: {
          manufacturer: null,
          resolution: 'UNKNOWN',
          confidence: 0,
          match_type: 'unresolved',
        },
        duplicates: { is_duplicate: false, matches: [] },
        extracted_attributes: {
          package: {
            code: 'package',
            value: '0805',
            unit: null,
            formatted: '0805',
            confidence: 0.95,
          },
        },
        execution_time_ms: 2,
      });
    }

    it('surfaces the category\u2019s bound attributes with no model involved', async () => {
      // The ML container being down must not cost the reviewer the category
      // intelligence: bindings and the catalog are ERP data.
      (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
      withCategories([CONN_ROW]);
      withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings(CONNECTOR_BINDINGS);

      const result = await service.suggest({
        query: 'JST XH connector 6 pin',
        categoryId: CONN_ROW.id,
      });

      expect(result.isMlActive).toBe(false);
      expect(
        result.attributeSuggestions.map((suggestion) => suggestion.code),
      ).toEqual(['package', 'mounting_type']);
      const mounting = result.attributeSuggestions[1]!;
      expect(mounting.suggestedValue).toBeNull();
      expect(mounting.confidence).toBeNull();
      expect(mounting.relevance[0]).toMatchObject({
        type: 'category_binding',
        categoryId: CONN_ROW.id,
      });
    });

    it('produces a canonical value for the package and infers the mounting type', async () => {
      withCategories([CONN_ROW]);
      withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings(CONNECTOR_BINDINGS);
      stubConnectorSuggestion();

      const result = await service.suggest({
        query: 'B06B-XH-A(LF)(SN) JST connector',
      });

      const pkg = result.attributeSuggestions.find(
        (suggestion) => suggestion.code === 'package',
      )!;
      expect(pkg.suggestedValue).toMatchObject({
        optionCode: '0805',
        optionLabel: '0805 (2012 Metric)',
        formatted: '0805',
      });
      expect(pkg.confidence).toBe(0.95);
      expect(pkg.confidenceLevel).toBe('HIGH');

      const mounting = result.attributeSuggestions.find(
        (suggestion) => suggestion.code === 'mounting_type',
      )!;
      expect(mounting.suggestedValue).toMatchObject({ optionCode: 'SMD' });
      expect(mounting.relevance.map((entry) => entry.type)).toContain(
        'package_pattern',
      );
    });

    it('flags a conflict with the recorded value instead of replacing it', async () => {
      withCategories([CONN_ROW]);
      withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings(CONNECTOR_BINDINGS);
      withComponentAttributeValues([
        {
          componentId: 'comp-1',
          attributeDefinitionId: 'def-mounting',
          optionId: 'opt-th',
          selectedOptionIds: null,
          booleanValue: null,
          numberValue: null,
          dateValue: null,
          textValue: null,
          unit: null,
        },
      ]);
      stubConnectorSuggestion();

      const result = await service.suggest({
        query: 'B06B-XH-A(LF)(SN) JST connector',
        componentId: 'comp-1',
      });

      const mounting = result.attributeSuggestions.find(
        (suggestion) => suggestion.code === 'mounting_type',
      )!;
      expect(mounting.existingDisplay).toBe('Through Hole');
      expect(mounting.conflict).toEqual({
        existingDisplay: 'Through Hole',
        suggestedDisplay: 'SMD',
      });
    });

    it('conditions relevance on a selected category rather than the prediction', async () => {
      withCategories([CONN_ROW, TERM_ROW]);
      withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings([
        {
          attributeDefinitionId: 'def-package',
          categoryId: CONN_ROW.id,
          isRequired: false,
          sortOrder: 1,
        },
        {
          attributeDefinitionId: 'def-mounting',
          categoryId: TERM_ROW.id,
          isRequired: false,
          sortOrder: 1,
        },
      ]);
      stubConnectorSuggestion();

      const result = await service.suggest({
        query: 'B06B-XH-A(LF)(SN) JST connector',
        categoryId: TERM_ROW.id,
      });

      // The selected category's binding comes first and is attributed to it.
      const mounting = result.attributeSuggestions[0]!;
      expect(mounting.code).toBe('mounting_type');
      expect(mounting.categoryIds).toEqual([TERM_ROW.id]);
      // The package stays relevant from the extraction alone, and is reported as
      // established by no binding at all — relevance is not limited to what the
      // selected category happens to bind.
      const pkg = result.attributeSuggestions[1]!;
      expect(pkg.code).toBe('package');
      expect(pkg.categoryIds).toEqual([]);
      expect(pkg.relevance.map((entry) => entry.type)).toEqual([
        'extracted_attribute',
      ]);
      // The selection conditions the relevance only; the prediction stands.
      expect(result.category?.categoryName).toBe('Connectors');
    });

    it('rejects a selected category that does not exist', async () => {
      withCategories([CONN_ROW]);

      await expect(
        service.suggest({ query: 'anything', categoryId: 'cat-missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns no suggestions when nothing resolves a category', async () => {
      withCategories([]);
      (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
        category_predictions: [],
        manufacturer: {
          manufacturer: null,
          resolution: 'UNKNOWN',
          confidence: 0,
          match_type: 'unresolved',
        },
        duplicates: { is_duplicate: false, matches: [] },
        extracted_attributes: {},
        execution_time_ms: 1,
      });

      const result = await service.suggest({ query: 'mystery part' });

      expect(result.attributeSuggestions).toEqual([]);
    });

    it('reports a binding inherited from a parent category as inherited', async () => {
      const child = { ...CONN_ROW, parentId: ELEC_ROW.id };
      withCategories([ELEC_ROW, child]);
      withAttributeDefinitions([PACKAGE_DEF]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings([
        {
          attributeDefinitionId: 'def-package',
          categoryId: ELEC_ROW.id,
          isRequired: false,
          sortOrder: 1,
        },
      ]);

      const result = await service.suggest({
        query: 'JST XH connector',
        categoryId: child.id,
      });

      expect(result.attributeSuggestions[0]!.relevance[0]).toMatchObject({
        type: 'category_binding_inherited',
      });
    });

    it('never suggests an attribute that is not active', async () => {
      withCategories([CONN_ROW]);
      withAttributeDefinitions([
        { ...PACKAGE_DEF, isActive: false },
        MOUNTING_DEF,
      ]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings(CONNECTOR_BINDINGS);

      (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
      const result = await service.suggest({
        query: 'JST XH connector',
        categoryId: CONN_ROW.id,
      });

      expect(
        result.attributeSuggestions.map((suggestion) => suggestion.code),
      ).toEqual(['mounting_type']);
    });

    it('bridges a Data Pack expectation onto the definition it names', async () => {
      const VOLTAGE_DEF = {
        id: 'def-voltage',
        code: 'voltage_rating',
        name: 'Voltage Rating',
        dataType: 'QUANTITY',
        unitCategory: 'Voltage',
        defaultUnit: 'V',
        aliases: [],
        isActive: true,
        validationRules: null,
      };
      withCategories([CAP_ROW, ELEC_ROW]);
      withAttributeDefinitions([VOLTAGE_DEF]);
      packsMock.getActiveIntelligenceHints.mockResolvedValue([
        {
          categoryName: 'Capacitors',
          categoryCode: 'CAP',
          expectedAttributes: ['voltage'],
          attributeAliases: { voltage: ['volt', 'vdc'] },
        },
      ]);

      (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
      const result = await service.suggest({
        query: '10uF 25V X7R capacitor',
        categoryId: CAP_ROW.id,
      });

      const voltage = result.attributeSuggestions.find(
        (suggestion) => suggestion.code === 'voltage_rating',
      )!;
      expect(voltage.relevance[0]).toMatchObject({
        type: 'data_pack_expectation',
        source: 'datapack:expected_attributes',
      });
      expect(voltage.relevance[0]!.description).toContain('Voltage Rating');
    });

    it('leaves the existing attribute record untouched', async () => {
      withCategories([CONN_ROW]);
      withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
      withAttributeOptions(OPTION_ROWS);
      withCategoryBindings(CONNECTOR_BINDINGS);
      stubConnectorSuggestion();

      const result = await service.suggest({
        query: 'B06B-XH-A(LF)(SN) JST connector',
      });

      // `attributes` keeps its meaning (what the extractor read, by code), and
      // the whole response is still assembled as before.
      expect(result.attributes['package']).toMatchObject({
        attributeDefinitionId: 'def-package',
        resolution: 'RESOLVED',
      });
      expect(result.isMlActive).toBe(true);
    });

    /**
     * The model service's judgement, merged as a corroborating source.
     *
     * It is asked once for the whole component (never once per attribute) and it
     * cannot introduce an attribute the catalog does not hold. When it is
     * unavailable nothing about the local result changes.
     */
    describe('the model service\u2019s judgement', () => {
      it('asks once, with the catalog, the bindings and the extraction', async () => {
        withCategories([CONN_ROW]);
        withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
        withAttributeOptions(OPTION_ROWS);
        withCategoryBindings(CONNECTOR_BINDINGS);
        stubConnectorSuggestion();

        await service.suggest({
          query: 'B06B-XH-A(LF)(SN) JST connector',
          datasheetText: 'Mounting Type: Through-hole',
        });

        expect(clientMock.suggestComponentAttributes).toHaveBeenCalledTimes(1);
        const payload = lastAttributePayload(clientMock)!;
        expect(payload.categories).toEqual([
          expect.objectContaining({
            categoryId: CONN_ROW.id,
            categoryName: 'Connectors',
          }),
        ]);
        // The whole active catalog, with the option catalogs a value must
        // resolve to.
        expect(payload.attributes).toEqual([
          expect.objectContaining({
            id: 'def-package',
            code: 'package',
            options: [{ code: '0805', label: '0805 (2012 Metric)' }],
          }),
          expect.objectContaining({
            id: 'def-mounting',
            options: [
              { code: 'SMD', label: 'Surface Mount (SMD/SMT)' },
              { code: 'Through Hole', label: 'Through Hole (THT)' },
            ],
          }),
        ]);
        // The bindings condition relevance there too.
        expect(payload.boundAttributeIds).toEqual([
          'def-package',
          'def-mounting',
        ]);
        expect(payload.datasheetText).toBe('Mounting Type: Through-hole');
        // Never re-extracted: the service judges what the extractor already read.
        expect(payload.extractedAttributes).toMatchObject({
          package: { code: 'package', value: '0805', formatted: '0805' },
        });
      });

      it('adds an attribute the local rules did not establish', async () => {
        withCategories([CONN_ROW]);
        withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
        withAttributeOptions(OPTION_ROWS);
        // Only the package is bound, so Mounting Type can only arrive from the
        // model's own judgement — which is the point of asking it.
        withCategoryBindings([CONNECTOR_BINDINGS[0]!]);
        stubConnectorSuggestion();
        (
          clientMock.suggestComponentAttributes as jest.Mock
        ).mockResolvedValueOnce([
          {
            attributeDefinitionId: 'def-mounting',
            code: 'mounting_type',
            name: 'Mounting Type',
            dataType: 'SELECT',
            relevance: [
              {
                type: 'domain_knowledge',
                description:
                  'Standard engineering specification for Connectors',
                weight: 0.8,
                source: 'domain:electronics_standard',
              },
            ],
            suggestedValue: null,
            confidence: null,
            confidenceLevel: null,
            valueEvidence: [],
          },
        ]);

        const result = await service.suggest({
          query: 'JST XH connector',
        });

        const mounting = result.attributeSuggestions.find(
          (suggestion) => suggestion.code === 'mounting_type',
        )!;
        expect(mounting).toBeDefined();
        // Established by no binding at all — relevance is not limited to what the
        // category happens to bind.
        expect(mounting.categoryIds).toEqual([]);
        expect(mounting.relevance).toEqual(
          expect.arrayContaining([
            // Reported in the shared vocabulary, never the model's own wording.
            expect.objectContaining({
              type: 'ml_attribute_knowledge',
              source: 'domain:electronics_standard',
              description: 'Standard engineering specification for Connectors',
            }),
            // Meanwhile the local package classification still ran and produced
            // its own value, which the model's value-less judgement cannot undo.
            expect.objectContaining({ type: 'package_pattern' }),
          ]),
        );
        expect(mounting.suggestedValue).toMatchObject({ optionCode: 'SMD' });
      });

      it('takes a canonical value the model named', async () => {
        withCategories([CONN_ROW]);
        withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
        withAttributeOptions(OPTION_ROWS);
        withCategoryBindings(CONNECTOR_BINDINGS);
        (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
        (
          clientMock.suggestComponentAttributes as jest.Mock
        ).mockResolvedValueOnce([
          {
            attributeDefinitionId: 'def-mounting',
            code: 'mounting_type',
            name: 'Mounting Type',
            relevance: [],
            suggestedValue: 'Through Hole',
            confidence: 0.88,
            confidenceLevel: 'HIGH',
            valueEvidence: [
              {
                type: 'ml_inference',
                description: "'through-hole' is the Mounting Type option",
                weight: 0.88,
                source: 'canonical:option_mapping',
              },
            ],
          },
        ]);

        const result = await service.suggest({
          query: 'JST XH connector',
          categoryId: CONN_ROW.id,
        });

        const mounting = result.attributeSuggestions.find(
          (suggestion) => suggestion.code === 'mounting_type',
        )!;
        expect(mounting.suggestedValue).toMatchObject({
          optionCode: 'Through Hole',
        });
        expect(mounting.confidence).toBe(0.88);
        expect(mounting.confidenceLevel).toBe('HIGH');
      });

      it('drops a value naming an option the definition does not have', async () => {
        withCategories([CONN_ROW]);
        withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
        withAttributeOptions(OPTION_ROWS);
        withCategoryBindings(CONNECTOR_BINDINGS);
        (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
        (
          clientMock.suggestComponentAttributes as jest.Mock
        ).mockResolvedValueOnce([
          {
            attributeDefinitionId: 'def-mounting',
            code: 'mounting_type',
            name: 'Mounting Type',
            relevance: [],
            suggestedValue: 'Soldered',
            confidence: 0.9,
            confidenceLevel: 'HIGH',
            valueEvidence: [],
          },
        ]);

        const result = await service.suggest({
          query: 'JST XH connector',
          categoryId: CONN_ROW.id,
        });

        expect(
          result.attributeSuggestions.find(
            (suggestion) => suggestion.code === 'mounting_type',
          )!.suggestedValue,
        ).toBeNull();
      });

      it('drops an attribute outside the catalog', async () => {
        withCategories([CONN_ROW]);
        withAttributeDefinitions([PACKAGE_DEF]);
        withAttributeOptions(OPTION_ROWS);
        withCategoryBindings(CONNECTOR_BINDINGS);
        (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
        (
          clientMock.suggestComponentAttributes as jest.Mock
        ).mockResolvedValueOnce([
          {
            attributeDefinitionId: 'def-not-in-catalog',
            code: 'invented',
            name: 'Invented',
            relevance: [],
            suggestedValue: null,
            valueEvidence: [],
          },
        ]);

        const result = await service.suggest({
          query: 'JST XH connector',
          categoryId: CONN_ROW.id,
        });

        expect(
          result.attributeSuggestions.map((suggestion) => suggestion.code),
        ).toEqual(['package']);
      });

      it('changes nothing when the call fails', async () => {
        withCategories([CONN_ROW]);
        withAttributeDefinitions([PACKAGE_DEF, MOUNTING_DEF]);
        withAttributeOptions(OPTION_ROWS);
        withCategoryBindings(CONNECTOR_BINDINGS);
        (clientMock.suggest as jest.Mock).mockResolvedValueOnce(null);
        (
          clientMock.suggestComponentAttributes as jest.Mock
        ).mockResolvedValueOnce(null);

        const result = await service.suggest({
          query: 'JST XH connector',
          categoryId: CONN_ROW.id,
        });

        expect(
          result.attributeSuggestions.map((suggestion) => suggestion.code),
        ).toEqual(['package', 'mounting_type']);
      });

      it('is not asked when no category could be established', async () => {
        withCategories([]);
        (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
          category_predictions: [],
          manufacturer: {
            manufacturer: null,
            resolution: 'UNKNOWN',
            confidence: 0,
            match_type: 'unresolved',
          },
          duplicates: { is_duplicate: false, matches: [] },
          extracted_attributes: {},
          execution_time_ms: 1,
        });

        await service.suggest({ query: 'mystery part' });

        expect(clientMock.suggestComponentAttributes).not.toHaveBeenCalled();
      });
    });

    describe('datasheet input', () => {
      it('forwards the pasted text', async () => {
        stubConnectorSuggestion();

        await service.suggest({
          query: 'B06B-XH-A',
          datasheetText: 'Mounting Type: Through-hole',
        });

        expect(lastSuggestPayload(clientMock).datasheet_text).toBe(
          'Mounting Type: Through-hole',
        );
      });

      it('forwards the PDF bytes rather than dropping them', async () => {
        stubConnectorSuggestion();

        await service.suggest({
          query: 'B06B-XH-A',
          datasheetPdfBase64: 'ZmFrZQ==',
        });

        // The model service reads the file itself; the API never extracted it,
        // so a caller holding only the PDF still gets its contents used.
        expect(lastSuggestPayload(clientMock).datasheet_pdf_base64).toBe(
          'ZmFrZQ==',
        );
      });
    });
  });
});
