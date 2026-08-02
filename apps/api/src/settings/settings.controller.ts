import { Controller, Get, Post, Put, Patch, Body, Param } from '@nestjs/common';
import { SettingsService } from './settings.service';
import {
  UpdateOrganizationProfileDto,
  UpdateSystemSettingsDto,
  UpdateNumberingSeriesDto,
  ToggleFeatureFlagDto,
} from './dtos';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('organization')
  getOrganizationProfile() {
    return this.service.getOrganizationProfile();
  }

  @Put('organization')
  updateOrganizationProfile(@Body() dto: UpdateOrganizationProfileDto) {
    return this.service.updateOrganizationProfile(dto);
  }

  @Get('system')
  getSystemSettings() {
    return this.service.getSystemSettings();
  }

  @Put('system')
  updateSystemSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.service.updateSystemSettings(dto);
  }

  @Get('numbering')
  getNumberingSeries() {
    return this.service.getNumberingSeries();
  }

  @Put('numbering')
  updateNumberingSeries(@Body() dto: UpdateNumberingSeriesDto) {
    return this.service.updateNumberingSeries(dto);
  }

  @Post('numbering/generate/:entityType')
  generateDocumentCode(@Param('entityType') entityType: string) {
    return this.service.generateDocumentCode(entityType);
  }

  @Get('feature-flags')
  getFeatureFlags() {
    return this.service.getFeatureFlags();
  }

  @Patch('feature-flags')
  toggleFeatureFlag(@Body() dto: ToggleFeatureFlagDto) {
    return this.service.toggleFeatureFlag(dto);
  }
}
