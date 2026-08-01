import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Headers,
  Param,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  ChangePasswordDto,
  ResetPasswordRequestDto,
  ResetPasswordDto,
} from './dtos';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Get('sessions')
  async getSessions(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '') || '';
    const me = await this.authService.getMeByToken(token);
    return this.authService.getUserSessions(me.user.id);
  }

  @Delete('sessions/:id')
  async revokeSession(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') sessionId: string,
  ) {
    const token = authHeader?.replace('Bearer ', '') || '';
    const me = await this.authService.getMeByToken(token);
    return this.authService.revokeSession(me.user.id, sessionId);
  }

  @Delete('sessions-revoke-others')
  async revokeOtherSessions(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '') || '';
    const me = await this.authService.getMeByToken(token);
    return this.authService.revokeAllOtherSessions(me.user.id, token);
  }
}
