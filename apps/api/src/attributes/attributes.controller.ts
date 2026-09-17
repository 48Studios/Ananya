import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AttributesService } from './attributes.service';
import { CreateAttributeDefinitionDto } from './dtos/create-attribute-definition.dto';
import { UpdateAttributeDefinitionDto } from './dtos/update-attribute-definition.dto';
import { CreateAttributeOptionDto } from './dtos/create-attribute-option.dto';
import { AssignCategoryAttributeDto } from './dtos/assign-category-attribute.dto';
import { SetComponentAttributesDto } from './dtos/set-component-attributes.dto';

@Controller()
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @Get('attributes')
  getAllDefinitions() {
    return this.attributesService.getAllDefinitions();
  }

  @Post('attributes')
  createDefinition(@Body() dto: CreateAttributeDefinitionDto) {
    return this.attributesService.createDefinition(dto);
  }

  @Get('attributes/:id')
  getDefinitionById(@Param('id') id: string) {
    return this.attributesService.getDefinitionById(id);
  }

  @Put('attributes/:id')
  updateDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateAttributeDefinitionDto,
  ) {
    return this.attributesService.updateDefinition(id, dto);
  }

  @Delete('attributes/:id')
  deleteDefinition(@Param('id') id: string) {
    return this.attributesService.deleteDefinition(id);
  }

  @Post('attributes/:id/options')
  addOption(@Param('id') id: string, @Body() dto: CreateAttributeOptionDto) {
    return this.attributesService.addOption(id, dto);
  }

  @Delete('attributes/options/:optionId')
  deleteOption(@Param('optionId') optionId: string) {
    return this.attributesService.deleteOption(optionId);
  }

  @Get('categories/:categoryId/attributes')
  getCategoryAttributes(@Param('categoryId') categoryId: string) {
    return this.attributesService.getCategoryAttributes(categoryId);
  }

  @Post('categories/:categoryId/attributes')
  assignCategoryAttribute(
    @Param('categoryId') categoryId: string,
    @Body() dto: AssignCategoryAttributeDto,
  ) {
    return this.attributesService.assignCategoryAttribute(categoryId, dto);
  }

  @Delete('categories/:categoryId/attributes/:attributeDefinitionId')
  unassignCategoryAttribute(
    @Param('categoryId') categoryId: string,
    @Param('attributeDefinitionId') attributeDefinitionId: string,
  ) {
    return this.attributesService.unassignCategoryAttribute(
      categoryId,
      attributeDefinitionId,
    );
  }

  @Get('components/:componentId/attributes')
  getComponentAttributes(@Param('componentId') componentId: string) {
    return this.attributesService.getComponentAttributes(componentId);
  }

  @Post('components/:componentId/attributes')
  setComponentAttributes(
    @Param('componentId') componentId: string,
    @Body() dto: SetComponentAttributesDto,
  ) {
    return this.attributesService.saveComponentAttributes(
      componentId,
      dto.attributes,
    );
  }

  @Delete('components/:componentId/attributes/:attributeDefinitionId')
  removeComponentAttribute(
    @Param('componentId') componentId: string,
    @Param('attributeDefinitionId') attributeDefinitionId: string,
  ) {
    return this.attributesService.removeComponentAttribute(
      componentId,
      attributeDefinitionId,
    );
  }
}
