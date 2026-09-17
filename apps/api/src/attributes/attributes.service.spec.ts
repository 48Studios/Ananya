import { Test, TestingModule } from '@nestjs/testing';
import { AttributesService } from './attributes.service';
import {
  ATTRIBUTE_DEFINITION_REPOSITORY,
  ATTRIBUTE_OPTION_REPOSITORY,
  CATEGORY_ATTRIBUTE_REPOSITORY,
  COMPONENT_ATTRIBUTE_REPOSITORY,
} from './attribute.tokens';
import { CATEGORY_REPOSITORY } from '../categories/category.tokens';
import { UNIT_REPOSITORY } from '../units/unit.tokens';
import {
  AttributeDefinition,
  AttributeOption,
  CategoryAttribute,
  ComponentAttributeValue,
  Unit,
  Category,
  type AttributeDefinitionRepository,
  type AttributeOptionRepository,
  type CategoryAttributeRepository,
  type ComponentAttributeRepository,
  type CategoryRepository,
  type UnitRepository,
} from '@ananya/inventory';

describe('AttributesService', () => {
  let service: AttributesService;

  const mockDefs: AttributeDefinition[] = [];
  const mockOptions: AttributeOption[] = [];
  const mockCategoryAttrs: CategoryAttribute[] = [];
  const mockCompAttrs: ComponentAttributeValue[] = [];
  const mockUnits: Unit[] = [];
  const mockCategories: Category[] = [];

  const mockAttrDefRepo: AttributeDefinitionRepository = {
    findById: jest.fn((id) =>
      Promise.resolve(mockDefs.find((d) => d.id === id) ?? null),
    ),
    findByCode: jest.fn((code) =>
      Promise.resolve(mockDefs.find((d) => d.code === code) ?? null),
    ),
    findMany: jest.fn(() => Promise.resolve([...mockDefs])),
    save: jest.fn((def) => {
      mockDefs.push(def);
      return Promise.resolve(def);
    }),
    update: jest.fn((def) => {
      const idx = mockDefs.findIndex((d) => d.id === def.id);
      if (idx >= 0) mockDefs[idx] = def;
      return Promise.resolve(def);
    }),
    delete: jest.fn((id) => {
      const idx = mockDefs.findIndex((d) => d.id === id);
      if (idx >= 0) mockDefs.splice(idx, 1);
      return Promise.resolve();
    }),
  };

  const mockAttrOptionRepo: AttributeOptionRepository = {
    findById: jest.fn((id) =>
      Promise.resolve(mockOptions.find((o) => o.id === id) ?? null),
    ),
    findByDefinitionId: jest.fn((defId) =>
      Promise.resolve(
        mockOptions.filter((o) => o.attributeDefinitionId === defId),
      ),
    ),
    findByDefinitionIdAndCode: jest.fn((defId, code) =>
      Promise.resolve(
        mockOptions.find(
          (o) => o.attributeDefinitionId === defId && o.code === code,
        ) ?? null,
      ),
    ),
    save: jest.fn((opt) => {
      mockOptions.push(opt);
      return Promise.resolve(opt);
    }),
    update: jest.fn((opt) => Promise.resolve(opt)),
    delete: jest.fn(() => Promise.resolve()),
  };

  const mockCategoryAttrRepo: CategoryAttributeRepository = {
    findByCategoryId: jest.fn((catId) =>
      Promise.resolve(
        mockCategoryAttrs.filter((ca) => ca.categoryId === catId),
      ),
    ),
    findByCategoryIds: jest.fn((catIds) =>
      Promise.resolve(
        mockCategoryAttrs.filter((ca) => catIds.includes(ca.categoryId)),
      ),
    ),
    save: jest.fn((ca) => {
      mockCategoryAttrs.push(ca);
      return Promise.resolve(ca);
    }),
    delete: jest.fn(() => Promise.resolve()),
  };

  const mockComponentAttrRepo: ComponentAttributeRepository = {
    findByComponentId: jest.fn((compId) =>
      Promise.resolve(mockCompAttrs.filter((ca) => ca.componentId === compId)),
    ),
    findByComponentIds: jest.fn((compIds) => {
      const res: Record<string, ComponentAttributeValue[]> = {};
      for (const id of compIds) {
        res[id] = mockCompAttrs.filter((ca) => ca.componentId === id);
      }
      return Promise.resolve(res);
    }),
    upsertMany: jest.fn((vals) => {
      for (const v of vals) {
        const idx = mockCompAttrs.findIndex(
          (m) =>
            m.componentId === v.componentId &&
            m.attributeDefinitionId === v.attributeDefinitionId,
        );
        if (idx >= 0) {
          mockCompAttrs[idx] = v;
        } else {
          mockCompAttrs.push(v);
        }
      }
      return Promise.resolve(vals);
    }),
    deleteByComponentId: jest.fn(() => Promise.resolve()),
    deleteByComponentAndAttribute: jest.fn(
      (componentId: string, attributeDefinitionId: string) => {
        const idx = mockCompAttrs.findIndex(
          (m) =>
            m.componentId === componentId &&
            m.attributeDefinitionId === attributeDefinitionId,
        );
        if (idx >= 0) {
          mockCompAttrs.splice(idx, 1);
        }
        return Promise.resolve();
      },
    ),
  };

  const mockCategoryRepo: CategoryRepository = {
    findById: jest.fn((id) =>
      Promise.resolve(mockCategories.find((c) => c.id === id) ?? null),
    ),
    findByCode: jest.fn((code) =>
      Promise.resolve(mockCategories.find((c) => c.code === code) ?? null),
    ),
    findByParentId: jest.fn(() => Promise.resolve([])),
    findMany: jest.fn(() => Promise.resolve([...mockCategories])),
    save: jest.fn((c) => Promise.resolve(c)),
    update: jest.fn((c) => Promise.resolve(c)),
    delete: jest.fn(() => Promise.resolve()),
    hasChildren: jest.fn(() => Promise.resolve(false)),
    hasComponents: jest.fn(() => Promise.resolve(false)),
  };

  const mockUnitRepo: UnitRepository = {
    findById: jest.fn((id) =>
      Promise.resolve(mockUnits.find((u) => u.id === id) ?? null),
    ),
    findByName: jest.fn((name) =>
      Promise.resolve(mockUnits.find((u) => u.name === name) ?? null),
    ),
    findByCategory: jest.fn(() => Promise.resolve([])),
    findMany: jest.fn(() => Promise.resolve([...mockUnits])),
    save: jest.fn((u) => Promise.resolve(u)),
    update: jest.fn((u) => Promise.resolve(u)),
    delete: jest.fn(() => Promise.resolve()),
  };

  beforeEach(async () => {
    mockDefs.length = 0;
    mockOptions.length = 0;
    mockCategoryAttrs.length = 0;
    mockCompAttrs.length = 0;
    mockUnits.length = 0;
    mockCategories.length = 0;

    // Seed units: ohm (base), kohm (1000)
    mockUnits.push(
      Unit.create({
        name: 'ohm',
        category: 'Resistance',
        isBaseUnit: true,
        precision: 0,
      }),
      Unit.create({
        name: 'kohm',
        category: 'Resistance',
        isBaseUnit: false,
        conversionFactor: 1000,
        precision: 3,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributesService,
        { provide: ATTRIBUTE_DEFINITION_REPOSITORY, useValue: mockAttrDefRepo },
        { provide: ATTRIBUTE_OPTION_REPOSITORY, useValue: mockAttrOptionRepo },
        {
          provide: CATEGORY_ATTRIBUTE_REPOSITORY,
          useValue: mockCategoryAttrRepo,
        },
        {
          provide: COMPONENT_ATTRIBUTE_REPOSITORY,
          useValue: mockComponentAttrRepo,
        },
        { provide: CATEGORY_REPOSITORY, useValue: mockCategoryRepo },
        { provide: UNIT_REPOSITORY, useValue: mockUnitRepo },
      ],
    }).compile();

    service = module.get<AttributesService>(AttributesService);
  });

  it('should create an attribute definition with options', async () => {
    const created = await service.createDefinition({
      code: 'package',
      name: 'Package / Case',
      dataType: 'SELECT',
      options: [
        { code: '0805', label: '0805 (2012 Metric)', sortOrder: 1 },
        { code: '0603', label: '0603 (1608 Metric)', sortOrder: 2 },
      ],
    });

    expect(created).toBeDefined();
    expect(created.code).toBe('package');
    expect(created.name).toBe('Package / Case');
    expect(created.options).toHaveLength(2);
    expect(created.options[0]!.code).toBe('0805');
  });

  it('should save component attribute values with normalized quantity', async () => {
    // 1. Create definition
    await service.createDefinition({
      code: 'resistance',
      name: 'Resistance',
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
    });

    const compId = 'comp-123';

    // 2. Save 10 kohm
    const saved = await service.saveComponentAttributes(compId, [
      {
        code: 'resistance',
        value: 10,
        unit: 'kohm',
      },
    ]);

    expect(saved).toHaveLength(1);
    expect(saved[0]!.numberValue).toBe(10);
    // 10 kohm converted to base unit ohm = 10 * 1000 = 10000
    expect(saved[0]!.normalizedNumberValue).toBe(10000);
    expect(saved[0]!.unit).toBe('kohm');

    // 3. Retrieve populated component attributes
    const compAttrs = await service.getComponentAttributes(compId);
    expect(compAttrs.resistance).toBeDefined();
    expect(compAttrs.resistance!.value).toBe(10);
    expect(compAttrs.resistance!.unit).toBe('kohm');
    expect(compAttrs.resistance!.normalizedValue).toBe(10000);
    expect(compAttrs.resistance!.displayValue).toBe('10 kohm');
  });
});
