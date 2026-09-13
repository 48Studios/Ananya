import { Test, TestingModule } from '@nestjs/testing';
import { ImportExportService } from './import-export.service';
import {
  IMPORT_ENTITY_REGISTRY,
  getImporterDefinition,
  getTemplate,
  generateTemplateCsv,
  generateTemplateXlsx,
  getSystemFieldsWithAliases,
} from './importer-registry';
import { UploadedFileObj } from './dtos';

describe('Importer Registry & Template Generation (System-Wide)', () => {
  let service: ImportExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportExportService],
    }).compile();

    service = module.get<ImportExportService>(ImportExportService);
  });

  const registeredEntities = Object.keys(IMPORT_ENTITY_REGISTRY);

  it('should have registered definitions for all 25 system entities', () => {
    expect(registeredEntities.length).toBeGreaterThanOrEqual(25);
    expect(registeredEntities).toContain('Category');
    expect(registeredEntities).toContain('Component');
    expect(registeredEntities).toContain('Supplier');
    expect(registeredEntities).toContain('Manufacturer');
    expect(registeredEntities).toContain('Warehouse');
    expect(registeredEntities).toContain('WarehouseBin');
    expect(registeredEntities).toContain('Location');
    expect(registeredEntities).toContain('Unit');
    expect(registeredEntities).toContain('User');
  });

  registeredEntities.forEach((entityType) => {
    describe(`Importer: ${entityType}`, () => {
      it('should return a valid canonical importer definition', () => {
        const def = getImporterDefinition(entityType);
        expect(def.entityType).toBe(entityType);
        expect(def.fields.length).toBeGreaterThan(0);
        def.fields.forEach((f) => {
          expect(f.name).toBeDefined();
          expect(f.label).toBeDefined();
          expect(f.type).toBeDefined();
          expect(typeof f.required).toBe('boolean');
          expect(f.sampleValue).toBeDefined();
        });
      });

      it('should generate headers matching field names in getTemplate', () => {
        const template = getTemplate(entityType);
        const def = getImporterDefinition(entityType);
        const expectedHeaders = def.fields.map((f) => f.name);

        expect(template.headers).toEqual(expectedHeaders);
        expect(Object.keys(template.sampleRow)).toEqual(expectedHeaders);
      });

      it('should generate identical CSV and XLSX template headers', () => {
        const csvContent = generateTemplateCsv(entityType);
        const xlsxContent = generateTemplateXlsx(entityType);

        const csvFirstLine = csvContent.split('\n')[0];
        const xlsxFirstLine = xlsxContent.split('\n')[0];

        expect(csvFirstLine).toBe(xlsxFirstLine);
      });

      it('should feed generated CSV sample template into previewImport and succeed cleanly', () => {
        const csvContent = generateTemplateCsv(entityType);
        const mockFile: UploadedFileObj = {
          originalname: `${entityType.toLowerCase()}_sample.csv`,
          mimetype: 'text/csv',
          buffer: Buffer.from(csvContent),
          size: Buffer.from(csvContent).length,
        };

        const preview = service.previewImport(mockFile, entityType);

        expect(preview.totalRows).toBeGreaterThanOrEqual(1);
        expect(preview.validRowsCount).toBe(preview.totalRows);
        expect(preview.invalidRowsCount).toBe(0);
        expect(preview.errors).toEqual([]);
      });
    });
  });

  it('should include parentCode in Category sample template and parse successfully', () => {
    const csv = generateTemplateCsv('Category');
    expect(csv).toContain('parentCode');

    const mockFile: UploadedFileObj = {
      originalname: 'category_template.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Category');
    expect(preview.validRowsCount).toBe(2);
    expect(preview.columnMapping['parentCode']).toBe('parentCode');
  });

  it('should include categoryCode and manufacturerCode in Component sample template', () => {
    const csv = generateTemplateCsv('Component');
    expect(csv).toContain('categoryCode');
    expect(csv).toContain('manufacturerCode');

    const mockFile: UploadedFileObj = {
      originalname: 'component_template.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Component');
    expect(preview.validRowsCount).toBe(2);
  });

  it('should strictly define Manufacturer canonical fields (code, name) without website and generate valid template', () => {
    const def = getImporterDefinition('Manufacturer');
    const fieldNames = def.fields.map((f) => f.name);

    expect(fieldNames).toEqual(['code', 'name']);
    expect(fieldNames).not.toContain('website');

    const template = getTemplate('Manufacturer');
    expect(template.headers).toEqual(['code', 'name']);
    expect(template.sampleRow).toEqual({
      code: 'YAGEO',
      name: 'Yageo Corporation',
    });

    const csv = generateTemplateCsv('Manufacturer');
    const mockFile: UploadedFileObj = {
      originalname: 'manufacturer_template.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Manufacturer');
    expect(preview.validRowsCount).toBe(2);
    expect(preview.invalidRowsCount).toBe(0);
    expect(preview.errors).toEqual([]);
  });

  describe('Manufacturing Import Entity Resolution & Rejection', () => {
    it('should reject generic "Entity" entityType with a BadRequestException', () => {
      expect(() => getImporterDefinition('Entity')).toThrow(
        'No importer registered for entity type: "Entity"',
      );
    });

    it('should resolve "Manufacturing" and "ProductionOrder" aliases to "WorkOrder"', () => {
      const defMfg = getImporterDefinition('Manufacturing');
      expect(defMfg.entityType).toBe('WorkOrder');

      const defPo = getImporterDefinition('ProductionOrder');
      expect(defPo.entityType).toBe('WorkOrder');
    });

    it('should resolve "BOM" and "BillOfMaterials" aliases to "BOM"', () => {
      const defBom = getImporterDefinition('BOM');
      expect(defBom.entityType).toBe('BOM');

      const defBomFull = getImporterDefinition('BillOfMaterials');
      expect(defBomFull.entityType).toBe('BOM');
    });

    it('should generate valid WorkOrder template CSV and parse cleanly in previewImport', () => {
      const csv = generateTemplateCsv('WorkOrder');
      const mockFile: UploadedFileObj = {
        originalname: 'work_order_template.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'WorkOrder');
      expect(preview.validRowsCount).toBe(2);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.errors).toEqual([]);
    });

    it('should generate valid BOM template CSV and parse cleanly in previewImport', () => {
      const csv = generateTemplateCsv('BOM');
      const mockFile: UploadedFileObj = {
        originalname: 'bom_template.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'BOM');
      expect(preview.validRowsCount).toBe(2);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.errors).toEqual([]);
    });

    it('should generate valid PurchaseOrder multi-line template CSV and parse cleanly in previewImport', () => {
      const csv = generateTemplateCsv('PurchaseOrder');
      expect(csv).toContain('PO-2026-001');
      expect(csv).toContain('RES-10K-001');
      expect(csv).toContain('CAP-10UF-002');

      const mockFile: UploadedFileObj = {
        originalname: 'purchase_order_template.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');
      expect(preview.validRowsCount).toBe(2);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.errors).toEqual([]);
    });

    it('should guarantee reverse contract matching for all canonical fields across all 25 importers', () => {
      registeredEntities.forEach((entityType) => {
        const def = getImporterDefinition(entityType);
        const systemFieldsWithAliases = getSystemFieldsWithAliases(entityType);

        def.fields.forEach((fieldDef) => {
          const normName = fieldDef.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          const matchByName = systemFieldsWithAliases.find((item) =>
            item.aliases.includes(normName),
          );
          expect(matchByName).toBeDefined();
          expect(matchByName?.canonicalField).toBe(fieldDef.name);

          const normLabel = fieldDef.label
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          const matchByLabel = systemFieldsWithAliases.find((item) =>
            item.aliases.includes(normLabel),
          );
          expect(matchByLabel).toBeDefined();
          expect(matchByLabel?.canonicalField).toBe(fieldDef.name);
        });
      });
    });

    it('should auto-map header variants "Components", "Component", "SKU", "Part Number" to componentSku for PurchaseOrder', () => {
      const poAliases = getSystemFieldsWithAliases('PurchaseOrder');
      const compSkuItem = poAliases.find(
        (a) => a.canonicalField === 'componentSku',
      );
      expect(compSkuItem).toBeDefined();
      expect(compSkuItem?.aliases).toContain('components');
      expect(compSkuItem?.aliases).toContain('component');
      expect(compSkuItem?.aliases).toContain('componentsku');
      expect(compSkuItem?.aliases).toContain('sku');

      const compCatItem = poAliases.find(
        (a) => a.canonicalField === 'componentCategory',
      );
      expect(compCatItem).toBeDefined();
      expect(compCatItem?.aliases).toContain('componentcategory');
      expect(compCatItem?.aliases).toContain('category');

      const compMfgItem = poAliases.find(
        (a) => a.canonicalField === 'componentManufacturer',
      );
      expect(compMfgItem).toBeDefined();
      expect(compMfgItem?.aliases).toContain('componentmanufacturer');
      expect(compMfgItem?.aliases).toContain('manufacturer');
    });

    it('should perform complete round-trip preview mapping verification for all 25 registered entities', () => {
      registeredEntities.forEach((entityType) => {
        const csvContent = generateTemplateCsv(entityType);
        const headersLine = csvContent.split('\n')[0]!;
        const headers = headersLine.split(',');

        const mockFile: UploadedFileObj = {
          originalname: `${entityType.toLowerCase()}_roundtrip.csv`,
          mimetype: 'text/csv',
          buffer: Buffer.from(csvContent),
          size: Buffer.from(csvContent).length,
        };

        const preview = service.previewImport(mockFile, entityType);

        expect(preview.totalRows).toBeGreaterThanOrEqual(1);
        expect(preview.validRowsCount).toBe(preview.totalRows);
        expect(preview.invalidRowsCount).toBe(0);
        expect(preview.errors).toEqual([]);

        // Ensure every generated header is correctly mapped to system fields
        headers.forEach((h) => {
          expect(preview.columnMapping[h]).toBeDefined();
          expect(preview.systemFields).toContain(preview.columnMapping[h]);
        });
      });
    });

    it('should parse Purchase Order sample CSV when using alias header "Components" instead of "componentSku"', () => {
      const csvContent = generateTemplateCsv('PurchaseOrder');
      const modifiedCsv = csvContent.replace('componentSku', 'Components');

      const mockFile: UploadedFileObj = {
        originalname: 'po_alias_sample.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(modifiedCsv),
        size: Buffer.from(modifiedCsv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.validRowsCount).toBe(2);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.errors).toEqual([]);
      expect(preview.columnMapping['Components']).toBe('componentSku');
    });

    describe('Purchase Order vs Component Contract Isolation & Round-Trip', () => {
      it('should enforce that Purchase Order importer identity and definition is strictly separate from Component importer', () => {
        const poDef = getImporterDefinition('PurchaseOrder');
        const compDef = getImporterDefinition('Component');

        // 1. Select/resolve Purchase Order importer & assert identity is Purchase Order
        expect(poDef.entityType).toBe('PurchaseOrder');
        expect(poDef.label).toBe('Purchase Order');

        // 2. Assert Purchase Order importer !== Component importer
        expect(poDef).not.toEqual(compDef);
        expect(poDef.entityType).not.toBe(compDef.entityType);

        // 3. Assert wizard metadata identifies Purchase Order
        const templateMeta = getTemplate('PurchaseOrder');
        expect(templateMeta.entityType).toBe('PurchaseOrder');
        expect(templateMeta.label).toBe('Purchase Order');
        expect(templateMeta.description).toContain(
          'Procurement purchase order',
        );

        // 4 & 5. Generate/download Purchase Order sample and check filename convention
        const csvContent = generateTemplateCsv('PurchaseOrder');
        const expectedFilename = `${'PurchaseOrder'.toLowerCase()}_import_template.csv`;
        expect(expectedFilename).toBe('purchaseorder_import_template.csv');

        // 6. Assert sample headers are Purchase Order headers
        const firstLine = csvContent.split('\n')[0]!;
        const headers = firstLine.split(',');
        expect(headers).toContain('orderNumber');
        expect(headers).toContain('supplierCode');
        expect(headers).toContain('componentSku');
        expect(headers).toContain('componentCategory');
        expect(headers).toContain('componentManufacturer');
        expect(headers).toContain('quantity');
        expect(headers).toContain('unitPrice');

        // 7. Assert sample does NOT contain Component-only fields
        expect(headers).not.toContain('categoryCode');
        expect(headers).not.toContain('manufacturerCode');

        // 8 & 9. Feed sample into the Purchase Order importer & verify parsing succeeds
        const mockFile: UploadedFileObj = {
          originalname: expectedFilename,
          mimetype: 'text/csv',
          buffer: Buffer.from(csvContent),
          size: Buffer.from(csvContent).length,
        };

        const preview = service.previewImport(mockFile, 'PurchaseOrder');
        expect(preview.entityType).toBe('PurchaseOrder');
        expect(preview.label).toBe('Purchase Order');
        expect(preview.totalRows).toBe(2);
        expect(preview.validRowsCount).toBe(2);
        expect(preview.invalidRowsCount).toBe(0);
        expect(preview.errors).toEqual([]);
      });
    });
  });
});
