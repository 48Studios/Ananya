import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Req,
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly invitationsService: InvitationsService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('logout')
  logout(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '') || '';
    return this.authService.logout(token);
  }

  @Get('me')
  getMe(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '') || '';
    return this.authService.getMeByToken(token);
  }

  @Post('change-password')
  async changePassword(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    const token = authHeader?.replace('Bearer ', '') || '';
    const me = await this.authService.getMeByToken(token);
    return this.authService.changePassword(me.user.id, dto);
  }

  @Post('reset-password-request')
  requestPasswordReset(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('invitations')
  async createInvitation(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateInvitationDto,
  ) {
    const token = authHeader?.replace('Bearer ', '') || '';
    let userId: string | undefined;
    try {
      const me = await this.authService.getMeByToken(token);
      userId = me.user.id;
    } catch {
      // optional
    }
    return this.invitationsService.createInvitation(dto, userId);
  }

  @Get('invitations/verify/:token')
  verifyInvitation(@Param('token') token: string) {
    return this.invitationsService.verifyInvitationToken(token);
  }

  @Post('invitations/accept')
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(dto);
  }

  @Get('setup-status')
  getSetupStatus() {
    return this.onboardingService.getSetupStatus();
  }

  @Post('setup-organization')
  setupOrganization(@Body() dto: SetupOrganizationDto) {
    return this.onboardingService.setupOrganization(dto);
  }
}
