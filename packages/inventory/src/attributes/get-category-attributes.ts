import type { CategoryRepository } from "../categories/category.repository";
import type {
  AttributeDefinitionRepository,
  AttributeOptionRepository,
  CategoryAttributeRepository,
} from "./attribute.repository";
import type { AttributeDefinition } from "./attribute-definition";
import type { AttributeOption } from "./attribute-option";

export interface ResolvedCategoryAttribute {
  attributeDefinition: AttributeDefinition;
  options: AttributeOption[];
  isRequired: boolean;
  sortOrder: number;
  defaultValue?: Record<string, unknown> | null;
  inheritedFromCategoryId?: string | null;
}

export class GetCategoryAttributes {
  constructor(
    private readonly categoryRepo: CategoryRepository,
    private readonly categoryAttrRepo: CategoryAttributeRepository,
    private readonly attrDefRepo: AttributeDefinitionRepository,
    private readonly attrOptionRepo: AttributeOptionRepository,
  ) {}

  public async execute(
    categoryId: string,
  ): Promise<ResolvedCategoryAttribute[]> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        categoryId,
      );
    const targetCategory = isUuid
      ? await this.categoryRepo.findById(categoryId)
      : await this.categoryRepo.findByCode(categoryId);

    if (!targetCategory) {
      return [];
    }

    const targetCategoryId = targetCategory.id;

    // 1. Build ancestry chain from target category up to root
    const ancestryIds: string[] = [];
    let currentCat: typeof targetCategory | null = targetCategory;
    const visited = new Set<string>();

    while (currentCat && !visited.has(currentCat.id)) {
      visited.add(currentCat.id);
      ancestryIds.push(currentCat.id);
      currentCat = currentCat.parentId
        ? await this.categoryRepo.findById(currentCat.parentId)
        : null;
    }

    // Reverse so root is first, target category is last (allowing child overrides)
    const reversedAncestry = [...ancestryIds].reverse();

    // 2. Fetch category attributes across the whole chain
    const allBindings =
      await this.categoryAttrRepo.findByCategoryIds(reversedAncestry);

    // Group bindings by categoryId
    const bindingsByCat = new Map<string, typeof allBindings>();
    for (const b of allBindings) {
      const list = bindingsByCat.get(b.categoryId) ?? [];
      list.push(b);
      bindingsByCat.set(b.categoryId, list);
    }

    // 3. Merge in root-to-leaf order
    interface MergedBinding {
      attributeDefinitionId: string;
      isRequired: boolean;
      sortOrder: number;
      defaultValue?: Record<string, unknown> | null;
      inheritedFromCategoryId?: string | null;
    }

    const merged = new Map<string, MergedBinding>();

    for (const catId of reversedAncestry) {
      const catBindings = bindingsByCat.get(catId) ?? [];
      const isTargetCategory = catId === targetCategoryId;

      for (const b of catBindings) {
        const existing = merged.get(b.attributeDefinitionId);
        if (!existing) {
          merged.set(b.attributeDefinitionId, {
            attributeDefinitionId: b.attributeDefinitionId,
            isRequired: b.isRequired,
            sortOrder: b.sortOrder,
            defaultValue: b.defaultValue,
            inheritedFromCategoryId: isTargetCategory ? null : catId,
          });
        } else {
          // Child overrides parent settings
          merged.set(b.attributeDefinitionId, {
            attributeDefinitionId: b.attributeDefinitionId,
            isRequired: b.isRequired,
            sortOrder: b.sortOrder,
            defaultValue: b.defaultValue ?? existing.defaultValue,
            inheritedFromCategoryId: isTargetCategory
              ? null
              : existing.inheritedFromCategoryId,
          });
        }
      }
    }

    // 4. Hydrate definitions & options
    const result: ResolvedCategoryAttribute[] = [];
    for (const item of merged.values()) {
      const def = await this.attrDefRepo.findById(item.attributeDefinitionId);
      if (!def || !def.isActive) {
        continue;
      }

      let options: AttributeOption[] = [];
      if (def.dataType === "SELECT" || def.dataType === "MULTI_SELECT") {
        options = await this.attrOptionRepo.findByDefinitionId(def.id);
        options = options.filter((o) => o.isActive);
        options.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      result.push({
        attributeDefinition: def,
        options,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
        defaultValue: item.defaultValue,
        inheritedFromCategoryId: item.inheritedFromCategoryId,
      });
    }

    // 5. Final sort by sortOrder ascending, then definition name
    result.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.attributeDefinition.name.localeCompare(
        b.attributeDefinition.name,
      );
    });

    return result;
  }
}
