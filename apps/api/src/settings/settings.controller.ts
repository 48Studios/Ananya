import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';
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
  @UseGuards(
    createPermissionGuard('Administration.Settings', 'update organization profile'),
  )
  updateOrganizationProfile(@Body() dto: UpdateOrganizationProfileDto) {
    return this.service.updateOrganizationProfile(dto);
  }

  @Post('organization/reset')
  @UseGuards(
    createPermissionGuard('Administration.Roles', 'reset organization data'),
  )
  resetOrganizationData(
    @Body() dto: ResetOrganizationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }
    return this.resetService.resetOrganizationData(dto, userId);
  }

  @Get('system')
  getSystemSettings() {
    return this.service.getSystemSettings();
  }

  @Put('system')
  @UseGuards(
    createPermissionGuard('Administration.Settings', 'update system settings'),
  )
  updateSystemSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.service.updateSystemSettings(dto);
  }

  @Get('numbering')
  getNumberingSeries() {
    return this.service.getNumberingSeries();
  }

  @Put('numbering')
  @UseGuards(
    createPermissionGuard('Administration.Settings', 'update numbering series'),
  )
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
  @UseGuards(
    createPermissionGuard('Administration.Settings', 'toggle feature flags'),
  )
  toggleFeatureFlag(@Body() dto: ToggleFeatureFlagDto) {
    return this.service.toggleFeatureFlag(dto);
  }
}
