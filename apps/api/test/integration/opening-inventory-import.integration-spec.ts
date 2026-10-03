import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { Test, type TestingModule } from '@nestjs/testing';
import { closeDatabaseConnection, db } from '@ananya/database';
import {
  importExportJobs,
  inventoryAlerts,
  inventoryProjections,
  inventoryTransactions,
  locations,
  systemSettings,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { ImportExportService } from '../../src/import-export/import-export.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * Opening-inventory import → ledger → projection → alert.
 *
 * The import writes ledger rows directly, so before this fix the projection was
 * never rebuilt and an imported opening balance had no effect on stock (and
 * therefore could never fire an inventory alert). The import also wrote the
 * invalid `OPENING_BALANCE` type, which the domain and the projection
 * calculator both reject/ignore.
 *
 * Notifications are stubbed because the projection rebuild re-evaluates alerts
 * globally; this suite must not write in-app notifications to real users.
 */
describe('Opening inventory import', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const owner = new FixtureOwner('opening-inv');

  let app: TestingModule;
  let importService: ImportExportService;

  let componentId = '';
  let componentSku = '';
  let locationId = '';
  let locationCode = '';
  const createdJobIds: string[] = [];
  let originalReorderDefaults: Record<string, number> | null = null;
  const threshold = 10;

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationsService)
      .useValue({ createNotification: () => Promise.resolve(null) })
      .compile();

    app = moduleRef;
    await app.init();

    importService = app.get(ImportExportService);
    const componentsService = app.get(ComponentsService);

    const component = await owner.createComponent(
      componentsService,
      { unit: 'pcs' },
      'OPENING',
    );
    componentId = component.id;
    componentSku = (component as unknown as { sku: string }).sku;

    const [location] = await db
      .insert(locations)
      .values({
        code: owner.upperCode('OPENING-LOC'),
        name: owner.name('Opening Stock Bin'),
        kind: 'BIN',
      })
      .returning();
    if (!location) throw new Error('Failed to create opening import location.');
    locationId = location.id;
    locationCode = location.code;

    // Pin the threshold so the alert assertion is deterministic.
    const [settings] = await db.select().from(systemSettings).limit(1);
    originalReorderDefaults = settings?.reorderDefaultsJson ?? null;
    if (settings) {
      await db
        .update(systemSettings)
        .set({
          reorderDefaultsJson: {
            ...(settings.reorderDefaultsJson ?? {}),
            minStockLevel: threshold,
          },
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, settings.id));
    }
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    if (originalReorderDefaults) {
      const [settings] = await db.select().from(systemSettings).limit(1);
      if (settings) {
        await db
          .update(systemSettings)
          .set({ reorderDefaultsJson: originalReorderDefaults })
          .where(eq(systemSettings.id, settings.id));
      }
    }

    if (createdJobIds.length > 0) {
      await db
        .delete(importExportJobs)
        .where(inArray(importExportJobs.id, createdJobIds));
    }
    if (componentId) {
      await db
        .delete(inventoryTransactions)
        .where(eq(inventoryTransactions.componentId, componentId));
      await db
        .delete(inventoryProjections)
        .where(eq(inventoryProjections.componentId, componentId));
      await db
        .delete(inventoryAlerts)
        .where(eq(inventoryAlerts.componentId, componentId));
    }
    if (locationId) {
      await db.delete(locations).where(eq(locations.id, locationId));
    }

    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('projects imported opening balances and evaluates inventory alerts', async () => {
    if (!hasDbUrl) return;

    const csv = `sku,locationCode,quantity\n${componentSku},${locationCode},${threshold}\n`;
    const job = await importService.executeImport(
      {
        originalname: 'opening-inventory.csv',
        mimetype: 'text/csv',
        size: Buffer.byteLength(csv),
        buffer: Buffer.from(csv),
      },
      'OpeningInventory',
      {
        sku: 'sku',
        locationCode: 'locationCode',
        quantity: 'quantity',
      },
    );
    createdJobIds.push(job.id);

    expect(job.status).toBe('COMPLETED');
    expect(job.processedRecords).toBe(1);
    expect(job.failedRecords).toBe(0);

    const ledgerRows = await db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.componentId, componentId));
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.transactionType).toBe('InitialStock');
    expect(ledgerRows[0]?.destinationLocationId).toBe(locationId);

    const projections = await db
      .select()
      .from(inventoryProjections)
      .where(eq(inventoryProjections.componentId, componentId));
    expect(projections).toHaveLength(1);
    expect(projections[0]?.locationId).toBe(locationId);
    expect(projections[0]?.quantity).toBe(threshold);

    // The rebuild hook evaluates alerts, so an imported balance at the
    // reorder point opens a LOW_STOCK alert immediately.
    const alerts = await db
      .select()
      .from(inventoryAlerts)
      .where(
        and(
          eq(inventoryAlerts.componentId, componentId),
          eq(inventoryAlerts.status, 'ACTIVE'),
        ),
      );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.alertType).toBe('LOW_STOCK');
    expect(Number(alerts[0]?.onHandQuantity)).toBe(threshold);
  });

  it('re-derives the projection on a second import and resolves the alert when stock recovers', async () => {
    if (!hasDbUrl) return;

    const csv = `sku,locationCode,quantity\n${componentSku},${locationCode},${threshold}\n`;
    const job = await importService.executeImport(
      {
        originalname: 'opening-inventory-again.csv',
        mimetype: 'text/csv',
        size: Buffer.byteLength(csv),
        buffer: Buffer.from(csv),
      },
      'OpeningInventory',
      {
        sku: 'sku',
        locationCode: 'locationCode',
        quantity: 'quantity',
      },
    );
    createdJobIds.push(job.id);

    // Imports append to the ledger and the projection is derived from the whole
    // ledger, so a second import of the same balance doubles the projection.
    const projections = await db
      .select()
      .from(inventoryProjections)
      .where(eq(inventoryProjections.componentId, componentId));
    expect(projections[0]?.quantity).toBe(threshold * 2);

    // Stock above the reorder point resolves the alert; no duplicate row opens.
    const alerts = await db
      .select()
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.componentId, componentId));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.status).toBe('RESOLVED');
    expect(alerts[0]?.resolvedAt).toBeTruthy();

    const activeAlerts = alerts.filter((alert) => alert.status === 'ACTIVE');
    expect(activeAlerts).toEqual([]);
  });
});
