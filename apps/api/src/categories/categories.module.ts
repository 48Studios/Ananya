import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CATEGORY_REPOSITORY } from './category.tokens';
import { DrizzleCategoryRepository } from '../infrastructure/repositories/drizzle-category.repository';

@Module({
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    {
      provide: CATEGORY_REPOSITORY,
      useClass: DrizzleCategoryRepository,
    },
  ],
  exports: [CategoriesService],
})
export class CategoriesModule {}
