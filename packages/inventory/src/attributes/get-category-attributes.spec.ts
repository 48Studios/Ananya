import { describe, it, expect } from "vitest";
import { Category } from "../categories/category";
import type { CategoryRepository } from "../categories/category.repository";
import {
  AttributeDefinition,
  AttributeOption,
  CategoryAttribute,
  GetCategoryAttributes,
  type AttributeDefinitionRepository,
  type AttributeOptionRepository,
  type CategoryAttributeRepository,
} from "./index";

class MockCategoryRepo implements CategoryRepository {
  private categories = new Map<string, Category>();

  add(c: Category) {
    this.categories.set(c.id, c);
  }

  async findById(id: string): Promise<Category | null> {
    return this.categories.get(id) ?? null;
  }
  async findByCode(code: string): Promise<Category | null> {
    return (
      Array.from(this.categories.values()).find((c) => c.code === code) ?? null
    );
  }
  async findByParentId(parentId: string): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(
      (c) => c.parentId === parentId,
    );
  }
  async findMany(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }
  async save(category: Category): Promise<Category> {
    this.categories.set(category.id, category);
    return category;
  }
  async update(category: Category): Promise<Category> {
    this.categories.set(category.id, category);
    return category;
  }
  async delete(id: string): Promise<void> {
    this.categories.delete(id);
  }
  async hasChildren(id: string): Promise<boolean> {
    return Array.from(this.categories.values()).some((c) => c.parentId === id);
  }
  async hasComponents(): Promise<boolean> {
    return false;
  }
}

class MockCategoryAttrRepo implements CategoryAttributeRepository {
  private items: CategoryAttribute[] = [];

  add(ca: CategoryAttribute) {
    this.items.push(ca);
  }

  async findByCategoryId(categoryId: string): Promise<CategoryAttribute[]> {
    return this.items.filter((i) => i.categoryId === categoryId);
  }

  async findByCategoryIds(categoryIds: string[]): Promise<CategoryAttribute[]> {
    return this.items.filter((i) => categoryIds.includes(i.categoryId));
  }

  async findByAttributeDefinitionId(
    attributeDefinitionId: string,
  ): Promise<CategoryAttribute[]> {
    return this.items.filter(
      (i) => i.attributeDefinitionId === attributeDefinitionId,
    );
  }

  async findMany(): Promise<CategoryAttribute[]> {
    return [...this.items];
  }

  async save(categoryAttribute: CategoryAttribute): Promise<CategoryAttribute> {
    this.items.push(categoryAttribute);
    return categoryAttribute;
  }

  async delete(
    categoryId: string,
    attributeDefinitionId: string,
  ): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter(
      (i) =>
        !(
          i.categoryId === categoryId &&
          i.attributeDefinitionId === attributeDefinitionId
        ),
    );
    return this.items.length < before;
  }
}

class MockAttrDefRepo implements AttributeDefinitionRepository {
  private defs = new Map<string, AttributeDefinition>();

  add(d: AttributeDefinition) {
    this.defs.set(d.id, d);
  }

  async findById(id: string): Promise<AttributeDefinition | null> {
    return this.defs.get(id) ?? null;
  }
  async findByCode(code: string): Promise<AttributeDefinition | null> {
    return (
      Array.from(this.defs.values()).find((d) => d.code === code) ?? null
    );
  }
  async findMany(): Promise<AttributeDefinition[]> {
    return Array.from(this.defs.values());
  }
  async save(def: AttributeDefinition): Promise<AttributeDefinition> {
    this.defs.set(def.id, def);
    return def;
  }
  async update(def: AttributeDefinition): Promise<AttributeDefinition> {
    this.defs.set(def.id, def);
    return def;
  }
  async delete(id: string): Promise<void> {
    this.defs.delete(id);
  }
}

class MockAttrOptionRepo implements AttributeOptionRepository {
  private options: AttributeOption[] = [];

  add(o: AttributeOption) {
    this.options.push(o);
  }

  async findById(id: string): Promise<AttributeOption | null> {
    return this.options.find((o) => o.id === id) ?? null;
  }
  async findByDefinitionId(definitionId: string): Promise<AttributeOption[]> {
    return this.options.filter((o) => o.attributeDefinitionId === definitionId);
  }
  async findByDefinitionIdAndCode(
    definitionId: string,
    code: string,
  ): Promise<AttributeOption | null> {
    return (
      this.options.find(
        (o) => o.attributeDefinitionId === definitionId && o.code === code,
      ) ?? null
    );
  }
  async save(option: AttributeOption): Promise<AttributeOption> {
    this.options.push(option);
    return option;
  }
  async update(option: AttributeOption): Promise<AttributeOption> {
    const idx = this.options.findIndex((o) => o.id === option.id);
    if (idx >= 0) this.options[idx] = option;
    return option;
  }
  async delete(id: string): Promise<void> {
    this.options = this.options.filter((o) => o.id !== id);
  }
}

describe("GetCategoryAttributes Use Case", () => {
  it("should inherit attributes from parent categories with child override support", async () => {
    const catRepo = new MockCategoryRepo();
    const catAttrRepo = new MockCategoryAttrRepo();
    const attrDefRepo = new MockAttrDefRepo();
    const attrOptionRepo = new MockAttrOptionRepo();

    // 1. Root Category: "Electronic Components"
    const rootCat = Category.create({
      code: "ELEC",
      name: "Electronic Components",
    });
    catRepo.add(rootCat);

    // 2. Child Category: "Resistors"
    const resCat = Category.create({
      code: "ELEC-RES",
      name: "Resistors",
      parentId: rootCat.id,
    });
    catRepo.add(resCat);

    // 3. Definitions
    const packageDef = AttributeDefinition.create({
      code: "package",
      name: "Package / Case",
      dataType: "SELECT",
      sortOrder: 1,
    });
    attrDefRepo.add(packageDef);

    const opt0805 = AttributeOption.create({
      attributeDefinitionId: packageDef.id,
      code: "0805",
      label: "0805 (2012 Metric)",
      sortOrder: 1,
    });
    attrOptionRepo.add(opt0805);

    const resistanceDef = AttributeDefinition.create({
      code: "resistance",
      name: "Resistance",
      dataType: "QUANTITY",
      unitCategory: "Resistance",
      defaultUnit: "ohm",
      sortOrder: 2,
    });
    attrDefRepo.add(resistanceDef);

    // Root category has 'package' (optional, sortOrder 10)
    const rootPkgBind = CategoryAttribute.create({
      categoryId: rootCat.id,
      attributeDefinitionId: packageDef.id,
      isRequired: false,
      sortOrder: 10,
    });
    catAttrRepo.add(rootPkgBind);

    // Child category 'Resistors' has 'resistance' (required, sortOrder 1)
    const resBind = CategoryAttribute.create({
      categoryId: resCat.id,
      attributeDefinitionId: resistanceDef.id,
      isRequired: true,
      sortOrder: 1,
    });
    catAttrRepo.add(resBind);

    // Child category overrides 'package' to be required and sortOrder 2
    const childPkgOverride = CategoryAttribute.create({
      categoryId: resCat.id,
      attributeDefinitionId: packageDef.id,
      isRequired: true,
      sortOrder: 2,
    });
    catAttrRepo.add(childPkgOverride);

    const useCase = new GetCategoryAttributes(
      catRepo,
      catAttrRepo,
      attrDefRepo,
      attrOptionRepo,
    );

    const attributes = await useCase.execute(resCat.id);

    expect(attributes).toHaveLength(2);

    const attr0 = attributes[0]!;
    // First should be resistance (sortOrder 1)
    expect(attr0.attributeDefinition.code).toBe("resistance");
    expect(attr0.isRequired).toBe(true);
    expect(attr0.sortOrder).toBe(1);

    const attr1 = attributes[1]!;
    // Second should be package (overridden to sortOrder 2 and isRequired true)
    expect(attr1.attributeDefinition.code).toBe("package");
    expect(attr1.isRequired).toBe(true);
    expect(attr1.sortOrder).toBe(2);
    expect(attr1.options).toHaveLength(1);
    expect(attr1.options[0]!.code).toBe("0805");
  });
});
