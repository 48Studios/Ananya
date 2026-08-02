import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';
import { DocumentsController } from './documents.controller';
import { ActivityModule } from '../activity/activity.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';

@Module({
  imports: [ActivityModule, SecurityAuditModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, StorageService],
  exports: [DocumentsService, StorageService],
})
export class DocumentsModule {}
