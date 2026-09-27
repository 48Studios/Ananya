import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WorkflowEngineService } from './workflow-engine.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<Partial<NotificationsService>>;
  let workflowService: jest.Mocked<Partial<WorkflowEngineService>>;

  beforeEach(() => {
    service = {
      getUserNotifications: jest.fn().mockResolvedValue([]),
      getUnreadCount: jest.fn().mockResolvedValue(0),
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' } as any),
      markAsRead: jest.fn().mockResolvedValue({ id: 'notif-1', isRead: true } as any),
      markAllAsRead: jest.fn().mockResolvedValue({ success: true }),
      getPreferences: jest.fn().mockResolvedValue({ id: 'pref-1' } as any),
      updatePreferences: jest.fn().mockResolvedValue({ id: 'pref-1' } as any),
    };
    workflowService = {
      getWorkflows: jest.fn().mockResolvedValue([]),
      createWorkflow: jest.fn().mockResolvedValue({ id: 'wf-1' } as any),
      evaluateTriggers: jest.fn().mockResolvedValue({} as any),
    };
    controller = new NotificationsController(
      service as unknown as NotificationsService,
      workflowService as unknown as WorkflowEngineService,
    );
  });

  it('passes authenticated req.user.id to getUserNotifications', async () => {
    const req = {
      user: {
        id: 'user-notif-uuid',
        email: 'user@example.com',
        roleName: 'Standard',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.getUserNotifications(req);
    expect(service.getUserNotifications).toHaveBeenCalledWith('user-notif-uuid');
  });

  it('passes authenticated req.user.id to markAsRead', async () => {
    const req = {
      user: {
        id: 'user-notif-uuid',
        email: 'user@example.com',
        roleName: 'Standard',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.markAsRead('notif-123', req);
    expect(service.markAsRead).toHaveBeenCalledWith('notif-123', 'user-notif-uuid');
  });

  it('passes authenticated req.user.id to markAllAsRead', async () => {
    const req = {
      user: {
        id: 'user-notif-uuid',
        email: 'user@example.com',
        roleName: 'Standard',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.markAllAsRead(req);
    expect(service.markAllAsRead).toHaveBeenCalledWith('user-notif-uuid');
  });
});
