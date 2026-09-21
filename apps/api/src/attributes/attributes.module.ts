import { Module } from '@nestjs/common';
import { AttributesController } from './attributes.controller';
import { AttributesService } from './attributes.service';
import {
  ATTRIBUTE_DEFINITION_REPOSITORY,
  ATTRIBUTE_OPTION_REPOSITORY,
  CATEGORY_ATTRIBUTE_REPOSITORY,
  COMPONENT_ATTRIBUTE_REPOSITORY,
} from './attribute.tokens';
import { CATEGORY_REPOSITORY } from '../categories/category.tokens';
import { UNIT_REPOSITORY } from '../units/unit.tokens';
import {
  DrizzleAttributeDefinitionRepository,
  DrizzleAttributeOptionRepository,
  DrizzleCategoryAttributeRepository,
  DrizzleComponentAttributeRepository,
} from '../infrastructure/repositories/drizzle-attribute.repository';
import { DrizzleCategoryRepository } from '../infrastructure/repositories/drizzle-category.repository';
import { DrizzleUnitRepository } from '../infrastructure/repositories/drizzle-unit.repository';
import {
  AttributeDeleteGuard,
  AttributeReadGuard,
  AttributeWriteGuard,
} from '../auth/attribute-permissions';
// The attribute library routes are guarded (Pass 6C). Guards built by
// `createPermissionGuard` depend on `AuthService` and `PermissionsService`, so the
// module that declares the controller must import both — the same pair
// `ComponentsModule` and `MlModule` import for their guards.
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [AttributesController],
  providers: [
    AttributesService,
    // Declared so Nest resolves them from this module's context; they are the
    // same guard objects the review-queue controller uses.
    AttributeReadGuard,
    AttributeWriteGuard,
    AttributeDeleteGuard,
    {
      provide: ATTRIBUTE_DEFINITION_REPOSITORY,
      useClass: DrizzleAttributeDefinitionRepository,
    },
    {
      provide: ATTRIBUTE_OPTION_REPOSITORY,
      useClass: DrizzleAttributeOptionRepository,
    },
    {
      provide: CATEGORY_ATTRIBUTE_REPOSITORY,
      useClass: DrizzleCategoryAttributeRepository,
    },
    {
      provide: COMPONENT_ATTRIBUTE_REPOSITORY,
      useClass: DrizzleComponentAttributeRepository,
    },
    {
      provide: CATEGORY_REPOSITORY,
      useClass: DrizzleCategoryRepository,
    },
    {
      provide: UNIT_REPOSITORY,
      useClass: DrizzleUnitRepository,
    },
  ],
  exports: [
    AttributesService,
    ATTRIBUTE_DEFINITION_REPOSITORY,
    ATTRIBUTE_OPTION_REPOSITORY,
    CATEGORY_ATTRIBUTE_REPOSITORY,
    COMPONENT_ATTRIBUTE_REPOSITORY,
  ],
})
export class AttributesModule {}
