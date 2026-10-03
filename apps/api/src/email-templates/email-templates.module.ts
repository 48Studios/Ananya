import { Module } from '@nestjs/common';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesSeedService } from './email-templates.seed';
import { MailModule } from '../mail/mail.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';

@Module({
  imports: [MailModule, SecurityAuditModule],
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService, EmailTemplatesSeedService],
  exports: [EmailTemplatesService],
})
export class EmailTemplatesModule {}
