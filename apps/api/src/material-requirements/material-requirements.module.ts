import { Module } from '@nestjs/common';
import { MaterialRequirementsController } from './material-requirements.controller';
import {
  MaterialRequirementsService,
  MATERIAL_REQUIREMENT_REPOSITORY,
} from './material-requirements.service';
import { DrizzleMaterialRequirementRepository } from '../infrastructure/repositories/drizzle-material-requirement.repository';

@Module({
  controllers: [MaterialRequirementsController],
  providers: [
    MaterialRequirementsService,
    {
      provide: MATERIAL_REQUIREMENT_REPOSITORY,
      useClass: DrizzleMaterialRequirementRepository,
    },
  ],
  exports: [MaterialRequirementsService],
})
export class MaterialRequirementsModule {}
