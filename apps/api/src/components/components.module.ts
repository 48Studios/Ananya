import { Module } from '@nestjs/common';
import { COMPONENT_REPOSITORY } from './component.tokens';
import { DrizzleComponentRepository } from '../infrastructure/repositories/drizzle-component.repository';
import { ComponentsController } from './components.controller';
import { ComponentsService } from './components.service';

import { AttributesModule } from '../attributes/attributes.module';

@Module({
  imports: [AttributesModule],
  controllers: [ComponentsController],
  providers: [
    ComponentsService,
    {
      provide: COMPONENT_REPOSITORY,
      useClass: DrizzleComponentRepository,
    },
  ],
  exports: [ComponentsService],
})
export class ComponentsModule {}
