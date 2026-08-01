import { Test, TestingModule } from '@nestjs/testing';
import { ImportExportService } from './import-export.service';

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

  it('should parse CSV file content for preview', () => {
    const csv =
      'sku,name,unit\nRES-001,Resistor 1k,pcs\nCAP-001,Capacitor 10uF,pcs';
    const preview = service.previewImport({
      entityType: 'Component',
      fileContent: csv,
    });

    expect(preview.totalRows).toBe(2);
    expect(preview.validRowsCount).toBe(2);
    expect(preview.headers).toEqual(['sku', 'name', 'unit']);
  });
});
