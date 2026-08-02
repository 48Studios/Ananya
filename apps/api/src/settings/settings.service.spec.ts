import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockActivityService = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: ActivityService, useValue: mockActivityService },
        { provide: SecurityAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
