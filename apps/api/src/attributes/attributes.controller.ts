import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  AttributeDeleteGuard,
  AttributeReadGuard,
  AttributeWriteGuard,
} from '../auth/attribute-permissions';
import { AttributesService } from './attributes.service';
import { CreateAttributeDefinitionDto } from './dtos/create-attribute-definition.dto';
import { UpdateAttributeDefinitionDto } from './dtos/update-attribute-definition.dto';
import { CreateAttributeOptionDto } from './dtos/create-attribute-option.dto';
import { AssignCategoryAttributeDto } from './dtos/assign-category-attribute.dto';
import { BindCategoryDto } from './dtos/bind-category.dto';
import { UpdateCategoryBindingDto } from './dtos/update-category-binding.dto';
import { SetComponentAttributesDto } from './dtos/set-component-attributes.dto';

/**
 * The attribute library — definitions, category bindings, options, and the
 * component attribute values recorded against them.
 *
 * This is the authoritative write surface for the data Attribute Intelligence
 * reviews, and the surface an applied finding mutates. It is also the surface
 * Pass 7 extends with attribute-definition creation, which is why the
 * authorization boundary below is part of the Pass 6C audit rather than a
 * separate concern.
 *
 * ### Pass 6C: the route security audit
 *
 * Before this, **no route on this controller had a guard** — the largest
 * unauthenticated write surface left in the API once Pass 6 closed
 * `ComponentsController`. Anonymous callers could create, rename, deactivate and
 * hard-delete attribute definitions, bind and unbind categories, add and remove
 * options, and write or erase component attribute values.
 *
 * That is directly load-bearing for the intelligence architecture: the guarded
 * `POST /ml/attributes/review-queue/:id/apply` and the legacy
 * `POST /ml/attributes/apply-bindings` mutate a category binding, and the
 * unguarded `POST /attributes/:id/categories`, `PUT
 * /attributes/:id/categories/:categoryId` and `DELETE
 * /attributes/:id/categories/:categoryId` routes performed exactly the same
 * mutation. A guard on the intelligence route was therefore not a boundary for
 * the mutation — it was a boundary for one caller of it.
 *
 * | Route class | Guard | Permission |
 * | --- | --- | --- |
 * | every `GET` | `AttributeReadGuard` | `Inventory.Read` |
 * | create/update a definition, bind/unbind, options, component values | `AttributeWriteGuard` | `Inventory.Update` |
 * | `DELETE /attributes/:id` | `AttributeDeleteGuard` | `Inventory.Delete` |
 *
 * The permission vocabulary is reused exactly as it is for the review queue and
 * for components — no new permission, and no change to the role model. The one
 * behavioural consequence is recorded in {@link AttributeDeleteGuard}: an
 * `Inventory Manager` (Update without Delete) now receives `403` when deleting a
 * definition, where previously the route was open to everyone.
 *
 * The web client sends its session token on every request, so signed-in users
 * continue to work unchanged. The attribute management UI does not yet hide
 * actions the signed-in user cannot perform, so a read-only user sees a clear
 * `403` instead of a silent mutation; adding those affordances is a UI change
 * and is recorded as deferred debt rather than made here.
 */
@Controller()
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @Get('attributes')
  @UseGuards(AttributeReadGuard)
  getAllDefinitions() {
    return this.attributesService.getAllDefinitions();
  }

  @Post('attributes')
  @UseGuards(AttributeWriteGuard)
  createDefinition(@Body() dto: CreateAttributeDefinitionDto) {
    return this.attributesService.createDefinition(dto);
  }

  @Get('attributes/:id')
  @UseGuards(AttributeReadGuard)
  getDefinitionById(@Param('id') id: string) {
    return this.attributesService.getDefinitionById(id);
  }

  @Put('attributes/:id')
  @UseGuards(AttributeWriteGuard)
  updateDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateAttributeDefinitionDto,
  ) {
    return this.attributesService.updateDefinition(id, dto);
  }

  @Delete('attributes/:id')
  @UseGuards(AttributeDeleteGuard)
  deleteDefinition(@Param('id') id: string) {
    return this.attributesService.deleteDefinition(id);
  }

  @Get('attributes/:id/categories')
  @UseGuards(AttributeReadGuard)
  getAttributeCategories(@Param('id') id: string) {
    return this.attributesService.getAttributeCategories(id);
  }

  @Post('attributes/:id/categories')
  @UseGuards(AttributeWriteGuard)
  bindCategoryToAttribute(
    @Param('id') id: string,
    @Body() dto: BindCategoryDto,
  ) {
    return this.attributesService.bindCategoryToAttribute(id, dto);
  }

  @Put('attributes/:id/categories/:categoryId')
  @UseGuards(AttributeWriteGuard)
  updateCategoryBinding(
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryBindingDto,
  ) {
    return this.attributesService.updateCategoryBinding(id, categoryId, dto);
  }

  @Delete('attributes/:id/categories/:categoryId')
  @UseGuards(AttributeWriteGuard)
  unbindCategoryFromAttribute(
    @Param('id') id: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.attributesService.unbindCategoryFromAttribute(id, categoryId);
  }

  @Post('attributes/:id/options')
  @UseGuards(AttributeWriteGuard)
  addOption(@Param('id') id: string, @Body() dto: CreateAttributeOptionDto) {
    return this.attributesService.addOption(id, dto);
  }

  @Delete('attributes/options/:optionId')
  @UseGuards(AttributeWriteGuard)
  deleteOption(@Param('optionId') optionId: string) {
    return this.attributesService.deleteOption(optionId);
  }

  @Get('categories/:categoryId/attributes')
  @UseGuards(AttributeReadGuard)
  getCategoryAttributes(@Param('categoryId') categoryId: string) {
    return this.attributesService.getCategoryAttributes(categoryId);
  }

  @Post('categories/:categoryId/attributes')
  @UseGuards(AttributeWriteGuard)
  assignCategoryAttribute(
    @Param('categoryId') categoryId: string,
    @Body() dto: AssignCategoryAttributeDto,
  ) {
    return this.attributesService.assignCategoryAttribute(categoryId, dto);
  }

  @Delete('categories/:categoryId/attributes/:attributeDefinitionId')
  @UseGuards(AttributeWriteGuard)
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
  @UseGuards(AttributeReadGuard)
  getComponentAttributes(@Param('componentId') componentId: string) {
    return this.attributesService.getComponentAttributes(componentId);
  }

  @Post('components/:componentId/attributes')
  @UseGuards(AttributeWriteGuard)
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
  @UseGuards(AttributeWriteGuard)
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
