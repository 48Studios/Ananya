import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  type INestApplicationContext,
} from '@nestjs/common';
import { closeDatabaseConnection } from '@ananya/database';
import { AppModule } from '../../src/app.module';
import { BulkActionService } from '../../src/import-export/bulk-action.service';
import { BulkActionType } from '../../src/import-export/dtos';
import { CategoriesService } from '../../src/categories/categories.service';
import { ComponentsService } from '../../src/components/components.service';

/**
 * Bulk actions against a live database.
 *
 * The point of these tests is that the bulk path is not a shortcut: it runs the
 * owning module's own operation, so a domain refusal (a category with children)
 * still refuses, and an archive really writes the flag the list screens read.
 */
describe('Bulk actions', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = Math.random().toString(36).slice(2, 8);

  let app: INestApplicationContext;
  let bulkActions: BulkActionService;
  let categories: CategoriesService;
  let components: ComponentsService;

  const createdCategoryIds: string[] = [];
  const createdComponentIds: string[] = [];

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    bulkActions = app.get(BulkActionService);
    categories = app.get(CategoriesService);
    components = app.get(ComponentsService);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await components.delete(id).catch(() => undefined);
    }
    // Children before parents: the domain refuses a category that still has
    // children, and cleanup must respect the same rule.
    for (const id of [...createdCategoryIds].reverse()) {
      await categories.delete(id).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  async function createCategory(
    code: string,
    parentId?: string,
  ): Promise<string> {
    const category = await categories.create({
      code,
      name: `Bulk action fixture ${code}`,
      parentId: parentId ?? null,
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  async function createComponent(suffix: string): Promise<string> {
    const component = await components.create({
      sku: `BULK-${runTag}-${suffix}`.toUpperCase(),
      name: `Bulk action fixture ${runTag} ${suffix}`,
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);
    return component.id;
  }

  it('archives and re-activates a component through the module update path', async () => {
    if (!hasDbUrl) return;

    const componentId = await createComponent('archive');

    const archived = await bulkActions.execute({
      entityType: 'Component',
      action: BulkActionType.ARCHIVE,
      ids: [componentId],
    });
    expect(archived.appliedCount).toBe(1);
    expect(archived.skippedCount).toBe(0);
    expect((await components.getComponent(componentId)).isActive).toBe(false);

    const activated = await bulkActions.execute({
      entityType: 'Component',
      action: BulkActionType.UPDATE_STATUS,
      ids: [componentId],
    });
    expect(activated.appliedCount).toBe(1);
    expect((await components.getComponent(componentId)).isActive).toBe(true);
  });

  it('deletes a component through the domain delete use case', async () => {
    if (!hasDbUrl) return;

    const componentId = await createComponent('delete');

    const result = await bulkActions.execute({
      entityType: 'Component',
      action: BulkActionType.DELETE,
      ids: [componentId],
    });

    expect(result.appliedCount).toBe(1);
    expect(result.results[0]?.outcome).toBe('APPLIED');
    await expect(components.getComponent(componentId)).rejects.toBeDefined();
  });

  it('refuses to delete a category that still has children, then allows it once the child is gone', async () => {
    if (!hasDbUrl) return;

    const parentId = await createCategory(`BULKPAR-${runTag}`);
    const childId = await createCategory(`BULKCHI-${runTag}`, parentId);

    const refused = await bulkActions.execute({
      entityType: 'Category',
      action: BulkActionType.DELETE,
      ids: [parentId],
    });

    expect(refused.appliedCount).toBe(0);
    expect(refused.skippedCount).toBe(1);
    expect(refused.results[0]?.outcome).toBe('SKIPPED');
    expect(refused.results[0]?.reason).toBeTruthy();
    // The refusal left the record in place.
    await expect(categories.getCategory(parentId)).resolves.toBeDefined();

    const childDeleted = await bulkActions.execute({
      entityType: 'Category',
      action: BulkActionType.DELETE,
      ids: [childId],
    });
    expect(childDeleted.appliedCount).toBe(1);

    const parentDeleted = await bulkActions.execute({
      entityType: 'Category',
      action: BulkActionType.DELETE,
      ids: [parentId],
    });
    expect(parentDeleted.appliedCount).toBe(1);
  });

  it('reports an unknown id as skipped while the known ids still apply', async () => {
    if (!hasDbUrl) return;

    const componentId = await createComponent('mixed');
    // A well-formed UUID that belongs to nothing: the outcome must be a refusal
    // ("not found"), not a driver error.
    const unknownId = `00000000-0000-4000-8000-${Math.floor(
      Math.random() * 1e12,
    )
      .toString(16)
      .padStart(12, '0')}`;

    const result = await bulkActions.execute({
      entityType: 'Component',
      action: BulkActionType.ARCHIVE,
      ids: [unknownId, componentId],
    });

    expect(result.requestedCount).toBe(2);
    expect(result.appliedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.results[0]?.outcome).toBe('SKIPPED');
    expect(result.results[0]?.reason).toBeTruthy();
    expect(result.results[1]?.outcome).toBe('APPLIED');
  });

  it('refuses an unsupported action before touching any record', async () => {
    if (!hasDbUrl) return;

    const componentId = await createComponent('unsupported');
    const before = await components.getComponent(componentId);

    await expect(
      bulkActions.execute({
        entityType: 'Component',
        action: BulkActionType.ASSIGN_LOCATION,
        ids: [componentId],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const after = await components.getComponent(componentId);
    expect(after.isActive).toBe(before.isActive);
  });
});
