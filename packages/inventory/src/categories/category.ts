import { ObjectId } from "@ananya/core";
import {
  InvalidCategoryCodeError,
  InvalidCategoryNameError,
  CategoryCannotBeOwnParentError,
} from "./category.errors";

export interface CategoryProps {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryInput {
  code: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  code?: string;
  name?: string;
  description?: string | null;
  parentId?: string | null;
  isActive?: boolean;
}

export class Category {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly description: string | null;
  public readonly parentId: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: CategoryProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.description = props.description;
    this.parentId = props.parentId;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Category aggregate.
   */
  public static create(input: CreateCategoryInput): Category {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();

    if (!code) {
      throw new InvalidCategoryCodeError("Category code is required");
    }

    if (!name) {
      throw new InvalidCategoryNameError("Category name is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Category({
      id,
      code,
      name,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      isActive: true,
      createdAt,
      updatedAt,
    });
  }

  /**
   * Updates category parameters maintaining domain invariants.
   */
  public update(input: UpdateCategoryInput): Category {
    const code =
      input.code !== undefined ? input.code.trim().toUpperCase() : this.code;
    const name = input.name !== undefined ? input.name.trim() : this.name;
    const parentId =
      input.parentId !== undefined ? input.parentId : this.parentId;

    if (!code) {
      throw new InvalidCategoryCodeError("Category code is required");
    }

    if (!name) {
      throw new InvalidCategoryNameError("Category name is required");
    }

    if (parentId && parentId === this.id) {
      throw new CategoryCannotBeOwnParentError();
    }

    return new Category({
      id: this.id,
      code,
      name,
      description:
        input.description !== undefined ? input.description : this.description,
      parentId,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Rehydrates an existing Category from persistence.
   */
  public static rehydrate(props: CategoryProps): Category {
    return new Category(props);
  }
}
