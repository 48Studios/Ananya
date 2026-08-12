import { Test, TestingModule } from '@nestjs/testing';
import { ImportExportService } from './import-export.service';
import {
  IMPORT_ENTITY_REGISTRY,
  getImporterDefinition,
  getTemplate,
  generateTemplateCsv,
  generateTemplateXlsx,
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
  });
});
