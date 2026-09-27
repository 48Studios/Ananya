import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { InvitationsService } from './invitations.service';
import { OnboardingService } from './onboarding.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { ActivityModule } from '../activity/activity.module';
import { ComponentWriteGuard } from './component-write.guard';

import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    UsersModule,
    PermissionsModule,
    SecurityAuditModule,
    ActivityModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    InvitationsService,
    OnboardingService,
    ComponentWriteGuard,
    AuthGuard,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [
    AuthService,
    InvitationsService,
    OnboardingService,
    ComponentWriteGuard,
    AuthGuard,
  ],
})
export class AuthModule {}
