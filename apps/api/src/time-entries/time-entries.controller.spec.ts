import { ForbiddenException } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';

describe('TimeEntriesController', () => {
  let controller: TimeEntriesController;
  let service: jest.Mocked<Partial<TimeEntriesService>>;

  beforeEach(() => {
    service = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve(dto as any)),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          userId: 'user-worker',
          taskId: 'task-1',
          hours: 4,
          status: 'PENDING',
        } as any),
      ),
      approve: jest.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          id,
          status: 'APPROVED',
          approverId: dto.approverId,
        } as any),
      ),
      reject: jest.fn().mockResolvedValue({ status: 'REJECTED' } as any),
    };
    controller = new TimeEntriesController(
      service as unknown as TimeEntriesService,
    );
  });

  it('binds target userId to actorId for self-service time entry', async () => {
    const req = {
      user: {
        id: 'user-worker',
        email: 'worker@example.com',
        roleName: 'Operator',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.create(
      {
        taskId: 'task-1',
        date: '2026-09-27',
        hours: 4,
      },
      req,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-worker',
      }),
    );
  });

  it('rejects cross-user time entry creation by unauthorized employee', () => {
    const req = {
      user: {
        id: 'user-worker',
        email: 'worker@example.com',
        roleName: 'Operator',
        permissions: [],
      },
    } as AuthenticatedRequest;

    expect(() =>
      controller.create(
        {
          userId: 'other-user',
          taskId: 'task-1',
          date: '2026-09-27',
          hours: 4,
        },
        req,
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows cross-user time entry creation by authorized Project Manager', async () => {
    const req = {
      user: {
        id: 'manager-1',
        email: 'manager@example.com',
        roleName: 'Project Manager',
        permissions: ['Projects.Manage'],
      },
    } as AuthenticatedRequest;

    await controller.create(
      {
        userId: 'user-worker',
        taskId: 'task-1',
        date: '2026-09-27',
        hours: 4,
      },
      req,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-worker',
      }),
    );
  });

  it('rejects self-approval of time entries for non-admin managers', async () => {
    const req = {
      user: {
        id: 'user-worker',
        email: 'worker@example.com',
        roleName: 'Project Manager',
        permissions: ['Projects.Manage'],
      },
    } as AuthenticatedRequest;

    await expect(
      controller.approve('entry-1', { approverId: 'forged-id' }, req),
    ).rejects.toThrow(ForbiddenException);
  });

  it('authoritatively binds approverId to session identity upon approval', async () => {
    const req = {
      user: {
        id: 'manager-approver',
        email: 'approver@example.com',
        roleName: 'Project Manager',
        permissions: ['Projects.Manage'],
      },
    } as AuthenticatedRequest;

    await controller.approve(
      'entry-1',
      { approverId: 'forged-approver-id' },
      req,
    );

    expect(service.approve).toHaveBeenCalledWith('entry-1', {
      approverId: 'manager-approver',
    });
  });
});
