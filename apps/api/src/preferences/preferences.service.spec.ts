import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesService } from './preferences.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

describe('PreferencesService', () => {
  let service: PreferencesService;

  const mockActivityService = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesService,
        { provide: ActivityService, useValue: mockActivityService },
        { provide: SecurityAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
