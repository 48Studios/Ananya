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
    return this.service.getDashboardLayout(userId || 'default-user');
  }

  @Put('dashboard')
  updateDashboardLayout(
    @Query('userId') userId: string,
    @Body() dto: UpdateDashboardLayoutDto,
  ) {
    return this.service.updateDashboardLayout(userId || 'default-user', dto);
  }

  @Get('saved-views')
  getSavedViews(
    @Query('userId') userId: string,
    @Query('module') module?: string,
  ) {
    return this.service.getSavedViews(userId || 'default-user', module);
  }

  @Post('saved-views')
  createSavedView(
    @Query('userId') userId: string,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.service.createSavedView(userId || 'default-user', dto);
  }

  @Get('favorites')
  getFavorites(@Query('userId') userId?: string) {
    return this.service.getFavorites(userId || 'default-user');
  }

  @Post('favorites')
  addFavorite(@Query('userId') userId: string, @Body() dto: CreateFavoriteDto) {
    return this.service.addFavorite(userId || 'default-user', dto);
  }

  @Delete('favorites/:id')
  removeFavorite(@Query('userId') userId: string, @Param('id') id: string) {
    return this.service.removeFavorite(userId || 'default-user', id);
  }

  @Get('workspace')
  getWorkspacePreferences(@Query('userId') userId?: string) {
    return this.service.getWorkspacePreferences(userId || 'default-user');
  }

  @Put('workspace')
  updateWorkspacePreferences(
    @Query('userId') userId: string,
    @Body() dto: UpdateWorkspacePreferenceDto,
  ) {
    return this.service.updateWorkspacePreferences(
      userId || 'default-user',
      dto,
    );
  }
}
