import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import {
  UpdateDashboardLayoutDto,
  CreateSavedViewDto,
  CreateFavoriteDto,
  UpdateWorkspacePreferenceDto,
} from './dtos';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get('dashboard')
  getDashboardLayout(@Query('userId') userId?: string) {
    return this.service.getDashboardLayout(userId);
  }

  @Put('dashboard')
  updateDashboardLayout(
    @Query('userId') userId: string | undefined,
    @Body() dto: UpdateDashboardLayoutDto,
  ) {
    return this.service.updateDashboardLayout(userId, dto);
  }

  @Get('saved-views')
  getSavedViews(
    @Query('userId') userId?: string,
    @Query('module') module?: string,
  ) {
    return this.service.getSavedViews(userId, module);
  }

  @Post('saved-views')
  createSavedView(
    @Query('userId') userId: string | undefined,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.service.createSavedView(userId, dto);
  }

  @Get('favorites')
  getFavorites(@Query('userId') userId?: string) {
    return this.service.getFavorites(userId);
  }

  @Post('favorites')
  addFavorite(
    @Query('userId') userId: string | undefined,
    @Body() dto: CreateFavoriteDto,
  ) {
    return this.service.addFavorite(userId, dto);
  }

  @Delete('favorites/:id')
  removeFavorite(
    @Query('userId') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.removeFavorite(userId, id);
  }

  @Get('workspace')
  getWorkspacePreferences(@Query('userId') userId?: string) {
    return this.service.getWorkspacePreferences(userId);
  }

  @Put('workspace')
  updateWorkspacePreferences(
    @Query('userId') userId: string | undefined,
    @Body() dto: UpdateWorkspacePreferenceDto,
  ) {
    return this.service.updateWorkspacePreferences(userId, dto);
  }
}
