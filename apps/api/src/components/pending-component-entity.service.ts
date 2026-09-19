import { Injectable } from '@nestjs/common';
import type { Category, Manufacturer } from '@ananya/inventory';
import { CategoriesService } from '../categories/categories.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import {
  InvalidPendingComponentEntityError,
  PendingComponentEntityConflictError,
} from './pending-component-entity.errors';

export interface PendingManufacturerInput {
  name: string;
  code?: string;
}

export interface PendingCategoryInput {
  name: string;
  parentId?: string | null;
  code?: string;
  description?: string | null;
}

@Injectable()
export class PendingComponentEntityService {
  constructor(
    private readonly manufacturersService: ManufacturersService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async resolveManufacturer(
    manufacturerId: string | null | undefined,
    pending: PendingManufacturerInput | null | undefined,
  ): Promise<string | null | undefined> {
    if (manufacturerId && pending) {
      throw new PendingComponentEntityConflictError('manufacturer');
    }
    if (manufacturerId) return manufacturerId;
    if (!pending) return manufacturerId;

    const name = pending.name.trim();
    if (!name) throw new InvalidPendingComponentEntityError('manufacturer');
    const code = (pending.code?.trim() || this.toCode(name)).toUpperCase();
    const existing = await this.findManufacturer(name, code);
    if (existing) return existing.id;

    try {
      return (await this.manufacturersService.create({ code, name })).id;
    } catch (error) {
      const raced = await this.findManufacturer(name, code);
      if (raced) return raced.id;
      throw error;
    }
  }

  async resolveCategory(
    categoryId: string | null | undefined,
    pending: PendingCategoryInput | null | undefined,
  ): Promise<string | null | undefined> {
    if (categoryId && pending) {
      throw new PendingComponentEntityConflictError('category');
    }
    if (categoryId) return categoryId;
    if (!pending) return categoryId;

    const name = pending.name.trim();
    if (!name) throw new InvalidPendingComponentEntityError('category');
    const code = (pending.code?.trim() || this.toCode(name)).toUpperCase();
    const existing = await this.findCategory(name, code, pending.parentId);
    if (existing) return existing.id;

    try {
      return (
        await this.categoriesService.create({
          code,
          name,
          parentId: pending.parentId ?? null,
          description: pending.description ?? null,
        })
      ).id;
    } catch (error) {
      const raced = await this.findCategory(name, code, pending.parentId);
      if (raced) return raced.id;
      throw error;
    }
  }

  private async findManufacturer(
    name: string,
    code: string,
  ): Promise<Manufacturer | null> {
    const manufacturers = await this.manufacturersService.getAllManufacturers();
    const normalizedName = name.toLowerCase();
    return (
      manufacturers.find(
        (manufacturer) =>
          manufacturer.name.trim().toLowerCase() === normalizedName ||
          (manufacturer.code.trim().toLowerCase() === code.toLowerCase() &&
            manufacturer.name.trim().toLowerCase() === normalizedName),
      ) ?? null
    );
  }

  private async findCategory(
    name: string,
    code: string,
    parentId?: string | null,
  ): Promise<Category | null> {
    const categories = await this.categoriesService.getAllCategories();
    const normalizedName = name.toLowerCase();
    return (
      categories.find(
        (category) =>
          (category.name.trim().toLowerCase() === normalizedName ||
            (category.code.trim().toLowerCase() === code.toLowerCase() &&
              category.name.trim().toLowerCase() === normalizedName)) &&
          (parentId === undefined || category.parentId === (parentId ?? null)),
      ) ?? null
    );
  }

  private toCode(name: string): string {
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }
}
