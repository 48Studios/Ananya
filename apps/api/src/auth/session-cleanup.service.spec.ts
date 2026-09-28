import { SessionCleanupService } from './session-cleanup.service';
import { db } from '@ananya/database';

jest.mock('@ananya/database', () => ({
  db: {
    delete: jest.fn(),
  },
}));

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;

  beforeEach(() => {
    service = new SessionCleanupService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.stopPeriodicCleanup();
  });

  it('successfully cleans up expired sessions and reports count', async () => {
    const mockWhere = jest.fn().mockReturnValue({
      returning: jest
        .fn()
        .mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]),
    });
    (db.delete as jest.Mock).mockReturnValue({
      where: mockWhere,
    });

    const result = await service.cleanupExpiredSessions();

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.deletedCount).toBe(2);
    expect(db.delete).toHaveBeenCalled();
  });

  it('prevents overlapping executions via internal mutual exclusion', async () => {
    let resolveFirstCall: (val: any) => void;
    const slowPromise = new Promise<{
      then: (fn: (val: void) => void) => void;
    }>((resolve) => {
      resolveFirstCall = resolve;
    });

    const mockWhere = jest.fn().mockReturnValue({
      returning: jest.fn().mockReturnValue(slowPromise),
    });
    (db.delete as jest.Mock).mockReturnValue({
      where: mockWhere,
    });

    // Start first cleanup (long running)
    const firstCallPromise = service.cleanupExpiredSessions();

    // Immediately trigger second cleanup while first is running
    const secondCallResult = await service.cleanupExpiredSessions();

    expect(secondCallResult.skipped).toBe(true);
    expect(secondCallResult.deletedCount).toBe(0);

    // Resolve first
    resolveFirstCall!([{ id: 'sess-1' }]);
    const firstCallResult = await firstCallPromise;
    expect(firstCallResult.skipped).toBe(false);
    expect(firstCallResult.deletedCount).toBe(1);
  });

  it('fails safely and catches database errors without crashing process', async () => {
    (db.delete as jest.Mock).mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest
          .fn()
          .mockRejectedValue(new Error('Connection lost to database')),
      }),
    });

    const result = await service.cleanupExpiredSessions();

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.error).toContain('Connection lost to database');
    expect(service.isRunning()).toBe(false); // Lock released in finally block
  });

  it('manages timer lifecycle cleanly with startPeriodicCleanup and stopPeriodicCleanup', () => {
    const timer = service.startPeriodicCleanup(5000);
    expect(timer).toBeDefined();

    // Calling start again returns the existing timer without creating duplicate intervals
    const secondTimer = service.startPeriodicCleanup(5000);
    expect(secondTimer).toBe(timer);

    service.stopPeriodicCleanup();
    // After stop, calling start creates a new timer
    const thirdTimer = service.startPeriodicCleanup(5000);
    expect(thirdTimer).toBeDefined();
    service.stopPeriodicCleanup();
  });
});
