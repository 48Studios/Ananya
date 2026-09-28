import { forwardRef, Global, Module } from '@nestjs/common';
import { SecurityAuditService } from './security-audit.service';
import { SecurityAuditController } from './security-audit.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Global()
@Module({
  imports: [forwardRef(() => AuthModule), PermissionsModule],
  controllers: [SecurityAuditController],
  providers: [SecurityAuditService],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
