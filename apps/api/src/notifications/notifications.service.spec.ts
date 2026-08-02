import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

describe('NotificationsService', () => {
  let notificationsService: NotificationsService;
  let workflowService: WorkflowEngineService;

  const mockActivityService = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        WorkflowEngineService,
        { provide: ActivityService, useValue: mockActivityService },
        { provide: SecurityAuditService, useValue: mockAuditService },
      ],
    }).compile();

    notificationsService =
      module.get<NotificationsService>(NotificationsService);
    workflowService = module.get<WorkflowEngineService>(WorkflowEngineService);
  });

  it('should be defined', () => {
    expect(notificationsService).toBeDefined();
    expect(workflowService).toBeDefined();
  });
});
