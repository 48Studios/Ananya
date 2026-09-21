import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  StorageService,
  STORAGE_PROVIDER,
  createStorageProvider,
} from './storage.service';
import { DocumentsController } from './documents.controller';
import { ActivityModule } from '../activity/activity.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { DocumentReadGuard, DocumentWriteGuard } from './document-permissions';

@Module({
  imports: [
    ActivityModule,
    SecurityAuditModule,
    // Guards are ported onto the existing session + permission services.
    AuthModule,
    PermissionsModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    // Provider is built from STORAGE_DRIVER / STORAGE_LOCAL_PATH. An
    // unsupported driver fails at startup instead of writing files elsewhere.
    { provide: STORAGE_PROVIDER, useFactory: () => createStorageProvider() },
    StorageService,
    DocumentReadGuard,
    DocumentWriteGuard,
  ],
  exports: [DocumentsService, StorageService],
})
export class DocumentsModule {}
