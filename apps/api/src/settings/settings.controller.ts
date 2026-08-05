import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { OrganizationResetService } from './organization-reset.service';
import {
  UpdateOrganizationProfileDto,
  UpdateSystemSettingsDto,
  UpdateNumberingSeriesDto,
  ToggleFeatureFlagDto,
  ResetOrganizationDto,
} from './dtos';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly resetService: OrganizationResetService,
  ) {}

  @Get('organization')
  getOrganizationProfile() {
    return this.service.getOrganizationProfile();
  }

  @Put('organization')
  updateOrganizationProfile(@Body() dto: UpdateOrganizationProfileDto) {
    return this.service.updateOrganizationProfile(dto);
  }

  @Post('organization/reset')
  resetOrganizationData(
    @Body() dto: ResetOrganizationDto,
    @Req() req: { user?: { id: string } },
  ) {
    const userId = req.user?.id || 'system';
    return this.resetService.resetOrganizationData(dto, userId);
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
