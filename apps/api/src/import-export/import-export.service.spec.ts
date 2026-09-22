import { Test, TestingModule } from '@nestjs/testing';
import { ImportExportService } from './import-export.service';
import { UploadedFileObj, ExportFormat } from './dtos';

describe('ImportExportService', () => {
  let service: ImportExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportExportService],
    }).compile();

    service = module.get<ImportExportService>(ImportExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return default template for entity', () => {
    const template = service.getTemplate('Component');
    expect(template.headers).toContain('sku');
    expect(template.headers).toContain('name');
  });

  it('should return Category template with parentCode header', () => {
    const template = service.getTemplate('Category');
    expect(template.headers).toContain('code');
    expect(template.headers).toContain('name');
    expect(template.headers).toContain('description');
    expect(template.headers).toContain('parentCode');
  });

  it('should parse multipart uploaded CSV file buffer for preview', () => {
    const csv =
      'sku,name,unit\nRES-001,Resistor 1k,pcs\nCAP-001,Capacitor 10uF,pcs';
    const mockFile: UploadedFileObj = {
      originalname: 'test_components.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Component');

    expect(preview.totalRows).toBe(2);
    expect(preview.validRowsCount).toBe(2);
    expect(preview.headers).toEqual(['sku', 'name', 'unit']);
  });

  it('should parse Category hierarchy CSV file for preview', () => {
    const csv =
      'code,name,description,parentCode\nELEC,Electronics,Electronic items,\nPASSIVE,Passive Components,Passive parts,ELEC\nRES,Resistors,Resistor components,PASSIVE';
    const mockFile: UploadedFileObj = {
      originalname: 'test_categories.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Category');

    expect(preview.totalRows).toBe(3);
    expect(preview.validRowsCount).toBe(3);
    expect(preview.headers).toEqual([
      'code',
      'name',
      'description',
      'parentCode',
    ]);
  });

  it('should auto-map Parent Category headers to parentCode in preview columnMapping', () => {
    const csv =
      'Category Code,Category Name,Description,Parent Category\nCAP,Capacitors,Capacitors,ELEC';
    const mockFile: UploadedFileObj = {
      originalname: 'categories_aliased.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Category');

    expect(preview.columnMapping['Parent Category']).toBe('parentCode');
    expect(preview.columnMapping['Category Code']).toBe('code');
    expect(preview.columnMapping['Category Name']).toBe('name');
  });

  it('should reject self-parenting category in preview validation', () => {
    const csv = 'code,name,parentCode\nSELF_CAT,Self Parent,SELF_CAT';
    const mockFile: UploadedFileObj = {
      originalname: 'self_parent.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Category');

    expect(preview.invalidRowsCount).toBe(1);
    expect(preview.errors[0]?.message).toContain('cannot be its own parent');
  });

  it('should reject circular category hierarchy in preview validation', () => {
    const csv =
      'code,name,parentCode\nCAT_A,Category A,CAT_B\nCAT_B,Category B,CAT_A';
    const mockFile: UploadedFileObj = {
      originalname: 'circular_categories.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Category');

    expect(preview.invalidRowsCount).toBe(2);
    expect(preview.errors[0]?.message).toContain(
      'Circular category hierarchy detected',
    );
  });

  it('should reject duplicate category code in import file during preview', () => {
    const csv =
      'code,name,description\nDUP_CAT,Category One,Desc 1\nDUP_CAT,Category Two,Desc 2';
    const mockFile: UploadedFileObj = {
      originalname: 'duplicate_categories.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv),
      size: Buffer.from(csv).length,
    };

    const preview = service.previewImport(mockFile, 'Category');

    expect(preview.invalidRowsCount).toBe(1);
    expect(preview.errors[0]?.message).toContain(
      'Duplicate Category identity "dup_cat"',
    );
  });

  describe('Manufacturer Import Validation', () => {
    it('should validate valid Manufacturer CSV rows and auto-map aliases', () => {
      const csv =
        'Manufacturer Code,Manufacturer Name\nTI,Texas Instruments\nST,STMicroelectronics';
      const mockFile: UploadedFileObj = {
        originalname: 'manufacturers_valid.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'Manufacturer');

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(2);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.columnMapping['Manufacturer Code']).toBe('code');
      expect(preview.columnMapping['Manufacturer Name']).toBe('name');
    });

    it('should reject Manufacturer rows missing code or missing name', () => {
      const csv = 'code,name\n,Texas Instruments\nST,';
      const mockFile: UploadedFileObj = {
        originalname: 'manufacturers_missing_fields.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'Manufacturer');

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(0);
      expect(preview.invalidRowsCount).toBe(2);
      expect(
        preview.errors.some((e) =>
          e.message.includes('Missing required field: Manufacturer Code'),
        ),
      ).toBe(true);
      expect(
        preview.errors.some((e) =>
          e.message.includes('Missing required field: Manufacturer Name'),
        ),
      ).toBe(true);
    });

    it('should reject duplicate Manufacturer code within the same import file', () => {
      const csv = 'code,name\nYAGEO,Yageo Corp\nyageo,Yageo Secondary';
      const mockFile: UploadedFileObj = {
        originalname: 'manufacturers_duplicates.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'Manufacturer');

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(1);
      expect(preview.invalidRowsCount).toBe(1);
      expect(preview.errors[0]?.message).toContain(
        'Duplicate Manufacturer identity "yageo"',
      );
    });
  });

  describe('Purchase Order Import Validation', () => {
    it('should validate valid Purchase Order rows and map aliases', () => {
      const csv =
        'PO Number,Supplier Code,Vendor Part Number,Component Name,Quantity Ordered,Unit Purchase Price,Status\nPO-2026-901,SUP-001,YAG-RES-10K,Precision 10k Resistor,100,0.05,DRAFT';
      const mockFile: UploadedFileObj = {
        originalname: 'po_valid.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.entityType).toBe('PurchaseOrder');
      expect(preview.label).toBe('Purchase Order');
      expect(preview.totalRows).toBe(1);
      expect(preview.validRowsCount).toBe(1);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.columnMapping['PO Number']).toBe('orderNumber');
      expect(preview.columnMapping['Supplier Code']).toBe('supplierCode');
      expect(preview.columnMapping['Vendor Part Number']).toBe(
        'vendorPartNumber',
      );
      expect(preview.columnMapping['Component Name']).toBe('componentName');
    });

    it('should not expose component SKU, category, manufacturer or dead columns in the Purchase Order contract', () => {
      const csv =
        'PO Number,Supplier Code,Component SKU,Component Category,Component Manufacturer,PO Date,Expected Delivery Date,Unit of Measure,Quantity Ordered\nPO-2026-904,SUP-001,RES-10K-001,Resistors,Yageo,2026-08-15,2026-09-01,pcs,10';
      const mockFile: UploadedFileObj = {
        originalname: 'po_removed_columns.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.systemFields).not.toContain('componentSku');
      expect(preview.systemFields).not.toContain('componentCategory');
      expect(preview.systemFields).not.toContain('componentManufacturer');
      expect(preview.systemFields).not.toContain('poDate');
      expect(preview.systemFields).not.toContain('expectedDeliveryDate');
      expect(preview.systemFields).not.toContain('unitOfMeasure');

      expect(preview.columnMapping['Component SKU']).toBeUndefined();
      expect(preview.columnMapping['Component Category']).toBeUndefined();
      expect(preview.columnMapping['Component Manufacturer']).toBeUndefined();

      // The line still has no component reference at all, so it is rejected.
      expect(preview.validRowsCount).toBe(0);
      expect(
        preview.errors.some((e) =>
          e.message.includes(
            'either Vendor Part Number or Component Name is required',
          ),
        ),
      ).toBe(true);
    });

    it('should reject Purchase Order rows with invalid quantity or negative unit price', () => {
      const csv =
        'orderNumber,supplierCode,vendorPartNumber,quantity,unitPrice\nPO-2026-902,SUP-001,YAG-RES-10K,0,0.05\nPO-2026-903,SUP-001,MUR-CAP-10UF,10,-1.00';
      const mockFile: UploadedFileObj = {
        originalname: 'po_invalid_values.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(0);
      expect(preview.invalidRowsCount).toBe(2);
      expect(
        preview.errors.some((e) =>
          e.message.includes(
            'Quantity ordered must be strictly greater than 0',
          ),
        ),
      ).toBe(true);
      expect(
        preview.errors.some((e) =>
          e.message.includes('Unit price must be non-negative'),
        ),
      ).toBe(true);
    });

    it('should reject Purchase Order rows that carry neither vendor part number nor component name', () => {
      const csv =
        'orderNumber,supplierCode,quantity\nPO-2026-905,SUP-001,10\nPO-2026-906,SUP-001,20';
      const mockFile: UploadedFileObj = {
        originalname: 'po_missing_component_reference.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.validRowsCount).toBe(0);
      expect(preview.invalidRowsCount).toBe(2);
      expect(
        preview.errors.every((e) =>
          e.message.includes(
            'either Vendor Part Number or Component Name is required',
          ),
        ),
      ).toBe(true);
    });

    it('should reject duplicate Purchase Order lines sharing a vendor part number', () => {
      const csv =
        'orderNumber,supplierCode,vendorPartNumber,quantity\nPO-2026-907,SUP-001,yag-res-10k,10\nPO-2026-907,SUP-001,YAG-RES-10K,20';
      const mockFile: UploadedFileObj = {
        originalname: 'po_duplicate_part.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.validRowsCount).toBe(1);
      expect(preview.invalidRowsCount).toBe(1);
      expect(preview.errors[0]?.message).toContain(
        'Duplicate Purchase Order identity',
      );
    });

    it('should reject duplicate Purchase Order lines sharing a component name when no vendor part number is given', () => {
      const csv =
        'orderNumber,supplierCode,componentName,quantity\nPO-2026-908,SUP-001,Precision 10k Resistor,10\nPO-2026-908,SUP-001,PRECISION 10K RESISTOR,20';
      const mockFile: UploadedFileObj = {
        originalname: 'po_duplicate_name.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.validRowsCount).toBe(1);
      expect(preview.invalidRowsCount).toBe(1);
      expect(preview.errors[0]?.message).toContain(
        'Duplicate Purchase Order line identity',
      );
    });

    it('should accept two distinct components on the same purchase order', () => {
      const csv =
        'orderNumber,supplierCode,componentName,vendorPartNumber,quantity\nPO-2026-909,SUP-001,Precision 10k Resistor,YAG-RES-10K,10\nPO-2026-909,SUP-001,10uF Ceramic Capacitor,MUR-CAP-10UF,20';
      const mockFile: UploadedFileObj = {
        originalname: 'po_two_lines.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(csv),
        size: Buffer.from(csv).length,
      };

      const preview = service.previewImport(mockFile, 'PurchaseOrder');

      expect(preview.validRowsCount).toBe(2);
      expect(preview.invalidRowsCount).toBe(0);
      expect(preview.errors).toEqual([]);
    });
  });

  describe('executeExport', () => {
    it('should generate non-empty CSV export with header line', async () => {
      const result = await service.executeExport({
        entityType: 'Component',
        format: ExportFormat.CSV,
      });

      expect(result.fileContent).toBeDefined();
      expect(result.fileContent.length).toBeGreaterThan(0);
      expect(result.fileContent).toContain('sku');
      expect(result.fileName).toBe('component_export.csv');
      expect(result.format).toBe(ExportFormat.CSV);
    });

    it('should generate valid JSON export with specified columns', async () => {
      const result = await service.executeExport({
        entityType: 'Category',
        format: ExportFormat.JSON,
        columns: ['code', 'name'],
      });

      expect(result.fileContent).toBeDefined();
      expect(result.fileContent.length).toBeGreaterThan(0);
      expect(result.fileName).toBe('category_export.json');
      expect(result.format).toBe(ExportFormat.JSON);
      expect(() => JSON.parse(result.fileContent) as unknown).not.toThrow();
    });
  });
});
