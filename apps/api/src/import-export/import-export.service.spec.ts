import { Test, TestingModule } from '@nestjs/testing';
import { ImportExportService } from './import-export.service';
import { UploadedFileObj } from './dtos';

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
});
