import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { closeDatabaseConnection, db } from '@ananya/database';
import { numberingSeries } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import {
  Component,
  ComponentSkuAlreadyExistsError,
  formatComponentSku,
  type ComponentRepository,
} from '@ananya/inventory';
import { AppModule } from '../../src/app.module';
import { COMPONENT_REPOSITORY } from '../../src/components/component.tokens';
import { ComponentSkuPreviewService } from '../../src/components/component-sku-preview.service';
import { ComponentsService } from '../../src/components/components.service';

/**
 * SKU allocation against a live database.
 *
 * Covers the reported failure: a create request that submits the SKU shown by
 * the preview while that SKU is already taken. The numbering-series cursor is
 * not a reservation, so the request must fall through to the next free SKU
 * instead of surfacing a raw driver error.
 */
describe('Component SKU allocation', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = Math.random().toString(36).slice(2, 8);

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let previewService: ComponentSkuPreviewService;
  let repository: ComponentRepository;

  const createdComponentIds: string[] = [];

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    previewService = app.get(ComponentSkuPreviewService);
    repository = app.get<ComponentRepository>(COMPONENT_REPOSITORY);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  async function readCursorSku(): Promise<string> {
    const [series] = await db
      .select()
      .from(numberingSeries)
      .where(eq(numberingSeries.entityType, 'Component'));

    if (!series) return 'CMP-000001';

    return formatComponentSku(
      series.nextSequenceNumber,
      series.prefix,
      series.zeroPadLength,
    );
  }

  /** Reproduces the drift: the SKU sitting at the cursor is already taken. */
  async function ensureCursorSkuIsTaken(): Promise<string> {
    const sku = await readCursorSku();
    if (await repository.findBySku(sku)) return sku;

    const created = await repository.save(
      Component.create({
        sku,
        name: `SKU allocation fixture ${runTag}`,
        unit: 'pcs',
      }),
    );
    createdComponentIds.push(created.id);
    return sku;
  }

  it('translates a real duplicate-SKU violation into ComponentSkuAlreadyExistsError', async () => {
    if (!hasDbUrl) return;

    const sku = `E2E-SKU-${runTag}`;
    const created = await repository.save(
      Component.create({
        sku,
        name: `SKU duplicate fixture ${runTag}`,
        unit: 'pcs',
      }),
    );
    createdComponentIds.push(created.id);

    await expect(
      repository.save(
        Component.create({
          sku,
          name: `SKU duplicate fixture ${runTag}`,
          unit: 'pcs',
        }),
      ),
    ).rejects.toBeInstanceOf(ComponentSkuAlreadyExistsError);
  });

  it('previews a SKU that is still free when the cursor SKU is taken', async () => {
    if (!hasDbUrl) return;

    const taken = await ensureCursorSkuIsTaken();
    const preview = await previewService.preview();

    expect(preview).not.toBe(taken);
    expect(await repository.findBySku(preview)).toBeNull();
  });

  it('creates a component with the next free SKU when the submitted SKU is taken', async () => {
    if (!hasDbUrl) return;

    const taken = await ensureCursorSkuIsTaken();

    const created = await componentsService.create({
      sku: taken,
      name: `SKU allocation create fixture ${runTag}`,
      unit: 'pcs',
    });
    createdComponentIds.push(created.id);

    expect(created.sku).not.toBe(taken);
    expect(await repository.findBySku(created.sku)).not.toBeNull();
  });
});
