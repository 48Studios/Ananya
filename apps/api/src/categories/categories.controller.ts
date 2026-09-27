import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Category } from '@ananya/inventory';
import { CreateCategoryDto } from './create-category.dto';
import { UpdateCategoryDto } from './update-category.dto';
import { CategoriesService } from './categories.service';
import { CategoryExceptionFilter } from './category-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('categories')
@UseFilters(CategoryExceptionFilter)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Create', 'create category'))
  create(@Body() input: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(input);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read', 'view categories'))
  getAll(): Promise<Category[]> {
    return this.categoriesService.getAllCategories();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view category by id'))
  get(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.getCategory(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Update', 'update category'))
  update(
    @Param('id') id: string,
    @Body() input: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, input);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('Inventory.Delete', 'delete category'))
  delete(@Param('id') id: string): Promise<void> {
    return this.categoriesService.delete(id);
  }
}
