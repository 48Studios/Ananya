import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';

describe('PreferencesController', () => {
  let controller: PreferencesController;
  let service: jest.Mocked<Partial<PreferencesService>>;

  beforeEach(() => {
    service = {
      getDashboardLayout: jest
        .fn()
        .mockResolvedValue({ id: 'layout-1', userId: 'user-auth' } as any),
      updateDashboardLayout: jest
        .fn()
        .mockResolvedValue({ id: 'layout-1', userId: 'user-auth' } as any),
      getSavedViews: jest.fn().mockResolvedValue([]),
      createSavedView: jest
        .fn()
        .mockResolvedValue({ id: 'view-1', userId: 'user-auth' } as any),
      getFavorites: jest.fn().mockResolvedValue([]),
      addFavorite: jest
        .fn()
        .mockResolvedValue({ id: 'fav-1', userId: 'user-auth' } as any),
      removeFavorite: jest.fn().mockResolvedValue({ success: true }),
      getWorkspacePreferences: jest
        .fn()
        .mockResolvedValue({ id: 'ws-1', userId: 'user-auth' } as any),
      updateWorkspacePreferences: jest
        .fn()
        .mockResolvedValue({ id: 'ws-1', userId: 'user-auth' } as any),
    };
    controller = new PreferencesController(
      service as unknown as PreferencesService,
    );
  });

  it('passes authenticated req.user.id to getDashboardLayout', async () => {
    const req = {
      user: {
        id: 'user-auth-uuid',
        email: 'user@example.com',
        roleName: 'Standard',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.getDashboardLayout(req);
    expect(service.getDashboardLayout).toHaveBeenCalledWith('user-auth-uuid');
  });

  it('passes authenticated req.user.id to updateDashboardLayout', async () => {
    const req = {
      user: {
        id: 'user-auth-uuid',
        email: 'user@example.com',
        roleName: 'Standard',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.updateDashboardLayout(req, { widgetsJson: [] });
    expect(service.updateDashboardLayout).toHaveBeenCalledWith(
      'user-auth-uuid',
      { widgetsJson: [] },
    );
  });

  it('passes authenticated req.user.id to removeFavorite', async () => {
    const req = {
      user: {
        id: 'user-auth-uuid',
        email: 'user@example.com',
        roleName: 'Standard',
        permissions: [],
      },
    } as AuthenticatedRequest;

    await controller.removeFavorite(req, 'fav-123');
    expect(service.removeFavorite).toHaveBeenCalledWith(
      'user-auth-uuid',
      'fav-123',
    );
  });
});
