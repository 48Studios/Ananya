import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import {
  UpdateDashboardLayoutDto,
  CreateSavedViewDto,
  CreateFavoriteDto,
  UpdateWorkspacePreferenceDto,
} from './dtos';
import type { AuthenticatedRequest } from '../auth/permission.guard';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get('dashboard')
  getDashboardLayout(@Req() req: AuthenticatedRequest) {
    return this.service.getDashboardLayout(req.user!.id);
  }

  @Put('dashboard')
  updateDashboardLayout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateDashboardLayoutDto,
  ) {
    return this.service.updateDashboardLayout(req.user!.id, dto);
  }

  @Get('saved-views')
  getSavedViews(
    @Req() req: AuthenticatedRequest,
    @Query('module') module?: string,
  ) {
    return this.service.getSavedViews(req.user!.id, module);
  }

  @Post('saved-views')
  createSavedView(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.service.createSavedView(req.user!.id, dto);
  }

  @Get('favorites')
  getFavorites(@Req() req: AuthenticatedRequest) {
    return this.service.getFavorites(req.user!.id);
  }

  @Post('favorites')
  addFavorite(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateFavoriteDto,
  ) {
    return this.service.addFavorite(req.user!.id, dto);
  }

  @Delete('favorites/:id')
  removeFavorite(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.removeFavorite(req.user!.id, id);
  }

  @Get('workspace')
  getWorkspacePreferences(@Req() req: AuthenticatedRequest) {
    return this.service.getWorkspacePreferences(req.user!.id);
  }

  @Put('workspace')
  updateWorkspacePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateWorkspacePreferenceDto,
  ) {
    return this.service.updateWorkspacePreferences(req.user!.id, dto);
  }
}
