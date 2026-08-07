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
});
