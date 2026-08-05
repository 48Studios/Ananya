import { DomainError } from "@ananya/core";

export class CategoryCodeAlreadyExistsError extends DomainError {
  constructor(code: string) {
    super(`Category with code '${code}' already exists.`);
  }
}

export class CategoryNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Category not found: ${id}`);
  }
}

export class InvalidCategoryCodeError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidCategoryNameError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class CategoryCannotBeOwnParentError extends DomainError {
  constructor() {
    super("A category cannot be set as its own parent.");
  }
}

export class CategoryHasChildrenError extends DomainError {
  constructor(id: string) {
    super(
      `Cannot delete category '${id}' because it contains child subcategories.`,
    );
  }
}

export class CategoryReferencedByComponentsError extends DomainError {
  constructor(id: string) {
    super(
      `Cannot delete category '${id}' because it is referenced by active inventory components.`,
    );
  }
}
