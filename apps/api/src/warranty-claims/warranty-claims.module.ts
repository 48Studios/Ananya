import { Module } from '@nestjs/common';
import { WarrantyClaimsController } from './warranty-claims.controller';
import {
  WarrantyClaimsService,
  WARRANTY_CLAIM_REPOSITORY,
} from './warranty-claims.service';
import { DrizzleWarrantyClaimRepository } from '../infrastructure/repositories/drizzle-warranty-claim.repository';
import { CustomersModule } from '../customers/customers.module';
import { ComponentsModule } from '../components/components.module';

@Module({
  imports: [CustomersModule, ComponentsModule],
  controllers: [WarrantyClaimsController],
  providers: [
    WarrantyClaimsService,
    {
      provide: WARRANTY_CLAIM_REPOSITORY,
      useClass: DrizzleWarrantyClaimRepository,
    },
  ],
  exports: [WarrantyClaimsService],
})
export class WarrantyClaimsModule {}
