import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { InvitationsService } from './invitations.service';
import { OnboardingService } from './onboarding.service';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { ActivityService } from '../activity/activity.service';

describe('AuthService Suite', () => {
  let authService: AuthService;
  let invitationsService: InvitationsService;
  let onboardingService: OnboardingService;

  const mockUsersService = {
    findById: jest.fn().mockResolvedValue(null),
  };

  const mockPermissionsService = {
    getUserPermissions: jest.fn().mockResolvedValue([]),
    getPermissionGroups: jest.fn().mockResolvedValue([]),
  };

  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const mockActivityService = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        InvitationsService,
        OnboardingService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: SecurityAuditService, useValue: mockAuditService },
        { provide: ActivityService, useValue: mockActivityService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    invitationsService = module.get<InvitationsService>(InvitationsService);
    onboardingService = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
    expect(invitationsService).toBeDefined();
    expect(onboardingService).toBeDefined();
  });
});
