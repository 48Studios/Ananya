import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockStorageService = {
    storeFile: jest.fn().mockResolvedValue('/uploads/test.txt'),
    readFile: jest.fn().mockResolvedValue(Buffer.from('test')),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  const mockActivityService = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: StorageService, useValue: mockStorageService },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: SecurityAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
