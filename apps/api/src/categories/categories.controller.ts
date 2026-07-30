import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { Category } from '@ananya/inventory';
import { CreateCategoryDto } from './create-category.dto';
import { UpdateCategoryDto } from './update-category.dto';
import { CategoriesService } from './categories.service';
import { CategoryExceptionFilter } from './category-exception.filter';

@Controller('categories')
@UseFilters(CategoryExceptionFilter)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() input: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(input);
  }

  @Get()
  getAll(): Promise<Category[]> {
    return this.categoriesService.getAllCategories();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.getCategory(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() input: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, input);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.categoriesService.delete(id);
  }
}
