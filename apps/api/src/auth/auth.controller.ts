import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { InvitationsService } from './invitations.service';
import { OnboardingService } from './onboarding.service';
import {
  LoginDto,
  ChangePasswordDto,
  ResetPasswordRequestDto,
  ResetPasswordDto,
  CreateInvitationDto,
  AcceptInvitationDto,
  SetupOrganizationDto,
} from './dtos';

import { getClientIp } from '../common/utils/client-ip.util';
import { Public } from './public.decorator';
import {
  createPermissionGuard,
  extractBearerToken,
  type AuthenticatedRequest,
} from './permission.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly invitationsService: InvitationsService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = getClientIp(req);
    const userAgent =
      (req.headers['user-agent'] as string) || 'Unknown Browser';
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('logout')
  logout(
    @Req() req: AuthenticatedRequest,
    @Headers('authorization') authHeader?: string,
  ) {
    const token =
      extractBearerToken(req) || authHeader?.replace('Bearer ', '') || '';
    return this.authService.logout(token);
  }

  @Get('me')
  getMe(
    @Req() req: AuthenticatedRequest,
    @Headers('authorization') authHeader?: string,
  ) {
    const token =
      extractBearerToken(req) || authHeader?.replace('Bearer ', '') || '';
    return this.authService.getMeByToken(token);
  }

  @Post('change-password')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const token = extractBearerToken(req);
    return this.authService.changePassword(
      req.user!.id,
      dto,
      token || undefined,
    );
  }

  @Public()
  @Post('reset-password-request')
  requestPasswordReset(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('invitations')
  @UseGuards(
    createPermissionGuard('Administration.Users', 'create user invitations'),
  )
  async createInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvitation(dto, req.user!);
  }

  @Public()
  @Get('invitations/verify/:token')
  verifyInvitation(@Param('token') token: string) {
    return this.invitationsService.verifyInvitationToken(token);
  }

  @Public()
  @Post('invitations/accept')
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(dto);
  }

  @Public()
  @Get('setup-status')
  getSetupStatus() {
    return this.onboardingService.getSetupStatus();
  }

  @Public()
  @Get('bootstrap-status')
  getBootstrapStatus() {
    return this.onboardingService.getSetupStatus();
  }

  @Public()
  @Post('setup-organization')
  setupOrganization(@Body() dto: SetupOrganizationDto) {
    return this.onboardingService.setupOrganization(dto);
  }
}
