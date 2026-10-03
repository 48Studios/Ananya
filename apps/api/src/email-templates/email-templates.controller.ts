import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import {
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dtos';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('email-templates')
@UseGuards(createPermissionGuard('Administration.Settings'))
export class EmailTemplatesController {
  constructor(private readonly templatesService: EmailTemplatesService) {}

  @Get()
  listTemplates() {
    return this.templatesService.listTemplates();
  }

  @Get('variables')
  getVariableRegistry() {
    return this.templatesService.getVariableRegistry();
  }

  @Get(':eventType')
  getTemplate(@Param('eventType') eventType: string) {
    return this.templatesService.getTemplate(eventType);
  }

  @Put(':eventType')
  updateTemplate(
    @Param('eventType') eventType: string,
    @Body() dto: UpdateEmailTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.templatesService.updateTemplate(eventType, dto, req.user?.id);
  }

  @Post(':eventType/preview')
  @HttpCode(HttpStatus.OK)
  previewTemplate(
    @Param('eventType') eventType: string,
    @Body() dto: PreviewEmailTemplateDto,
  ) {
    return this.templatesService.previewTemplate(eventType, dto);
  }

  @Post(':eventType/test-send')
  testSend(
    @Param('eventType') eventType: string,
    @Body() dto: TestSendEmailTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.templatesService.sendTestEmail(eventType, dto, {
      id: req.user!.id,
      email: req.user!.email,
    });
  }

  @Post(':eventType/restore-default')
  restoreDefault(
    @Param('eventType') eventType: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.templatesService.restoreDefault(eventType, req.user?.id);
  }
}
