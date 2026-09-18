import { Test, TestingModule } from '@nestjs/testing';
import { MlService } from './ml.service';
import { MlClientService } from './ml-client.service';

jest.mock('@ananya/database', () => {
  interface QueryMock {
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    then: (resolve: (val: unknown[]) => unknown) => Promise<unknown>;
  }

  const makeQueryMock = (): QueryMock => {
    const res: QueryMock = {
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      then: (resolve: (val: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve),
    };
    res.where.mockReturnValue(res);
    res.orderBy.mockReturnValue(res);
    res.limit.mockReturnValue(res);
    return res;
  };

  return {
    db: {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(makeQueryMock),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockResolvedValue({ rowCount: 1 }),
      })),
    },
    categories: { isActive: 'isActive' },
    manufacturers: { isActive: 'isActive' },
    attributeDefinitions: {},
    components: {},
    aiSuggestionFeedback: {},
    eq: jest.fn(),
  };
});

describe('MlService', () => {
  let service: MlService;
  let clientMock: jest.Mocked<Partial<MlClientService>>;

  beforeEach(async () => {
    clientMock = {
      enabled: true,
      suggest: jest.fn(),
      health: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MlService,
        {
          provide: MlClientService,
          useValue: clientMock,
        },
      ],
    }).compile();

    service = module.get<MlService>(MlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should resolve suggestion using microservice response when online', async () => {
    (clientMock.suggest as jest.Mock).mockResolvedValueOnce({
      category_predictions: [
        {
          category: 'Electronic Components',
          subcategory: 'Resistors',
          confidence: 0.95,
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
    expect(result.manufacturer?.manufacturerName).toBe('Yageo');
    expect(result.attributes['resistance']?.value).toBe(10000);
    expect(result.attributes['voltage']?.value).toBe(50);
    expect(result.confidenceLevel).toBeDefined();
    expect(result.overallEvidence?.length).toBeGreaterThan(0);
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
});
