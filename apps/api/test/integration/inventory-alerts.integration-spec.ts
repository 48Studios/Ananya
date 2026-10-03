import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { Test, type TestingModule } from '@nestjs/testing';
import { closeDatabaseConnection, db } from '@ananya/database';
import {
  components,
  emailOutbox,
  inventoryAlerts,
  inventoryProjections,
  inventoryReservationLines,
  inventoryReservations,
  locations,
  notifications,
  systemSettings,
} from '@ananya/database/schema';
import { eq, inArray } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { InventoryAlertsService } from '../../src/inventory-alerts/inventory-alerts.service';
import {
  MailService,
  MAIL_CONFIG,
  MAIL_CONFIG_ERRORS,
  MAIL_TRANSPORT,
} from '../../src/mail/mail.service';
import type { MailConfig } from '../../src/mail/mail.config';
import type {
  MailMessage,
  MailSendResult,
  MailTransport,
} from '../../src/mail/mail.types';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { FixtureOwner } from '../fixtures/fixture-owner';

interface RecordedNotification {
  userId?: string;
  entityId?: string;
  type?: string;
  module?: string;
  title?: string;
  message?: string;
  priority?: string;
}

/**
 * Capturing, non-delivering transport. Tests assert exactly what the mail
 * subsystem handed to the provider; no SMTP connection is ever opened.
 */
class FakeMailTransport implements MailTransport {
  readonly name = 'fake';
  readonly captured: MailMessage[] = [];
  private failuresRemaining = 0;
  private failPermanently = false;

  failNext(count: number): void {
    this.failuresRemaining = count;
  }

  failAlways(): void {
    this.failPermanently = true;
  }

  send(message: MailMessage): Promise<MailSendResult> {
    if (this.failPermanently || this.failuresRemaining > 0) {
      if (!this.failPermanently) this.failuresRemaining -= 1;
      return Promise.resolve({
        accepted: false,
        error:
          'SMTP connection refused for smtp://mailer:super-secret@smtp.invalid:587',
      });
    }
    this.captured.push(message);
    return Promise.resolve({
      accepted: true,
      providerMessageId: `fake-${this.captured.length}`,
    });
  }

  verify(): Promise<{ ok: boolean; error?: string }> {
    return Promise.resolve({ ok: true });
  }
}

const TEST_MAIL_CONFIG: MailConfig = {
  enabled: true,
  transport: 'log',
  from: 'alerts@ananya.test',
  replyTo: undefined,
  maxAttempts: 2,
  smtp: {
    host: '',
    port: 587,
    secure: false,
    timeoutMs: 10000,
  },
};

describe('Inventory alerts', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const owner = new FixtureOwner('inv-alerts');

  let app: TestingModule;
  let alertsService: InventoryAlertsService;
  let componentsService: ComponentsService;
  let mailService: MailService;
  let transport: FakeMailTransport;
  let notificationsSpy: {
    createNotification: (input: RecordedNotification) => Promise<unknown>;
  };
  const recordedNotifications: RecordedNotification[] = [];

  const trackedComponentIds: string[] = [];
  const trackedUserIds: string[] = [];
  const trackedLocationIds: string[] = [];
  const trackedReservationIds: string[] = [];
  let originalReorderDefaults: Record<string, number> | null = null;
  let fixtureUserId = '';
  let confirmedLocationId = '';

  let outOfStock: { id: string; sku: string; name: string };
  let lowStock: { id: string; sku: string; name: string };
  let justAbove: { id: string; sku: string; name: string };
  let reserved: { id: string; sku: string; name: string };
  let inactive: { id: string; sku: string; name: string };
  let neverStocked: { id: string; sku: string; name: string };
  let recovering: { id: string; sku: string; name: string };
  let deactivated: { id: string; sku: string; name: string };
  let consolidated: { id: string; sku: string; name: string };

  // Some fixtures are created by the test that needs them, so this returns the
  // ids that exist at call time (used to scope queries and to clean up).
  const allFixtureComponentIds = () =>
    [
      outOfStock,
      lowStock,
      justAbove,
      reserved,
      inactive,
      neverStocked,
      recovering,
      deactivated,
      consolidated,
    ]
      .filter((component) => Boolean(component))
      .map((component) => component.id);

  function trackComponent<T extends { id: string }>(component: T): T {
    trackedComponentIds.push(component.id);
    return component;
  }

  async function setThreshold(value: number): Promise<void> {
    const [settings] = await db.select().from(systemSettings).limit(1);
    if (!settings) throw new Error('System settings row is missing.');
    await db
      .update(systemSettings)
      .set({
        reorderDefaultsJson: {
          ...(settings.reorderDefaultsJson ?? {}),
          minStockLevel: value,
        },
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, settings.id));
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    transport = new FakeMailTransport();
    notificationsSpy = {
      createNotification: (input: RecordedNotification) => {
        recordedNotifications.push(input);
        return Promise.resolve(null);
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(transport)
      .overrideProvider(MAIL_CONFIG)
      .useValue(TEST_MAIL_CONFIG)
      .overrideProvider(MAIL_CONFIG_ERRORS)
      .useValue([])
      // Notifications are stubbed so this suite cannot write in-app alerts to
      // real users sharing the development database. Persistence of in-app
      // notifications is covered by the notifications module's own tests.
      .overrideProvider(NotificationsService)
      .useValue(notificationsSpy)
      .compile();

    app = moduleRef;
    await app.init();

    alertsService = app.get(InventoryAlertsService);
    mailService = app.get(MailService);

    componentsService = app.get(ComponentsService);
    const rolesService = app.get(RolesService);
    const usersService = app.get(UsersService);

    const role = await owner.createRole(rolesService, ['Inventory.Read']);
    const user = await owner.createUser(
      usersService,
      role.id,
      'alert-recipient',
    );
    trackedUserIds.push(user.id);
    fixtureUserId = user.id;

    outOfStock = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-OOS',
      ),
    );
    lowStock = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-LOW',
      ),
    );
    justAbove = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-OK',
      ),
    );
    reserved = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-RES',
      ),
    );
    inactive = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-INACTIVE',
      ),
    );
    await componentsService.update(inactive.id, { isActive: false });
    neverStocked = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-NEW',
      ),
    );
    recovering = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-REC',
      ),
    );

    const [location] = await db
      .insert(locations)
      .values({
        code: owner.upperCode('ALERT-LOC'),
        name: owner.name('Alert Location'),
        kind: 'BIN',
      })
      .returning();
    if (!location) throw new Error('Failed to create alert location fixture.');
    trackedLocationIds.push(location.id);
    confirmedLocationId = location.id;

    await db.insert(inventoryProjections).values([
      {
        componentId: outOfStock.id,
        locationId: location.id,
        quantity: 0,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: lowStock.id,
        locationId: location.id,
        quantity: 10,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: justAbove.id,
        locationId: location.id,
        quantity: 11,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: reserved.id,
        locationId: location.id,
        quantity: 20,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: inactive.id,
        locationId: location.id,
        quantity: 0,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: recovering.id,
        locationId: location.id,
        quantity: 5,
        unitOfMeasure: 'pcs',
      },
    ]);

    const [reservation] = await db
      .insert(inventoryReservations)
      .values({
        reservationNumber: owner.upperCode('ALERT-RES'),
        reservationType: 'WORK_ORDER',
        reservedBy: 'e2e-alerts',
        status: 'ACTIVE',
      })
      .returning();
    if (!reservation) throw new Error('Failed to create reservation fixture.');
    trackedReservationIds.push(reservation.id);
    await db.insert(inventoryReservationLines).values({
      reservationId: reservation.id,
      componentId: reserved.id,
      locationId: location.id,
      reservedQuantity: '15',
      fulfilledQuantity: '0',
      unitOfMeasure: 'pcs',
    });

    const [settings] = await db.select().from(systemSettings).limit(1);
    originalReorderDefaults = settings?.reorderDefaultsJson ?? null;
    await setThreshold(10);
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

    if (trackedComponentIds.length > 0) {
      await db
        .delete(inventoryAlerts)
        .where(inArray(inventoryAlerts.componentId, trackedComponentIds));
      await db
        .delete(emailOutbox)
        .where(inArray(emailOutbox.sourceId, trackedComponentIds));
      await db
        .delete(inventoryProjections)
        .where(inArray(inventoryProjections.componentId, trackedComponentIds));
    }
    if (trackedUserIds.length > 0) {
      await db
        .delete(emailOutbox)
        .where(inArray(emailOutbox.recipientUserId, trackedUserIds));
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, trackedUserIds));
    }
    if (trackedReservationIds.length > 0) {
      await db
        .delete(inventoryReservations)
        .where(inArray(inventoryReservations.id, trackedReservationIds));
    }
    if (trackedLocationIds.length > 0) {
      await db
        .delete(locations)
        .where(inArray(locations.id, trackedLocationIds));
    }

    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('evaluates alert types with deliberate threshold boundaries', async () => {
    if (!hasDbUrl) return;

    const result = await alertsService.evaluate({
      componentIds: allFixtureComponentIds(),
    });

    expect(result.activated).toBeGreaterThanOrEqual(4);

    const alerts = await db
      .select()
      .from(inventoryAlerts)
      .where(
        inArray(inventoryAlerts.componentId, [
          outOfStock.id,
          lowStock.id,
          justAbove.id,
          reserved.id,
          inactive.id,
          neverStocked.id,
        ]),
      );

    const byComponent = new Map(
      alerts.map((alert) => [alert.componentId, alert]),
    );

    expect(byComponent.get(outOfStock.id)?.alertType).toBe('OUT_OF_STOCK');
    // Boundary: available == threshold still alerts.
    expect(byComponent.get(lowStock.id)?.alertType).toBe('LOW_STOCK');
    // One unit above the threshold does not.
    expect(byComponent.get(justAbove.id)).toBeUndefined();
    // Reservations reduce available stock: 20 on hand - 15 reserved = 5.
    expect(byComponent.get(reserved.id)?.alertType).toBe('LOW_STOCK');
    expect(Number(byComponent.get(reserved.id)?.availableQuantity)).toBe(5);
    // Inactive components and never-stocked components are not evaluated.
    expect(byComponent.get(inactive.id)).toBeUndefined();
    expect(byComponent.get(neverStocked.id)).toBeUndefined();
  });

  it('records on-hand, available and shortage snapshots on the alert', async () => {
    if (!hasDbUrl) return;

    const [alert] = await db
      .select()
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.componentId, lowStock.id));

    expect(Number(alert?.onHandQuantity)).toBe(10);
    expect(Number(alert?.availableQuantity)).toBe(10);
    expect(Number(alert?.thresholdQuantity)).toBe(10);
    expect(Number(alert?.shortageQuantity)).toBe(0);
    expect(alert?.status).toBe('ACTIVE');
    expect(alert?.notificationCount).toBeGreaterThanOrEqual(1);
  });

  it('notifies each recipient exactly once per activation and never on re-evaluation', async () => {
    if (!hasDbUrl) return;

    const callsAfterActivation = recordedNotifications.filter(
      (notification) =>
        notification.entityId === lowStock.id &&
        notification.userId === fixtureUserId,
    ).length;
    expect(callsAfterActivation).toBe(1);

    const before = await db
      .select()
      .from(emailOutbox)
      .where(inArray(emailOutbox.sourceId, allFixtureComponentIds()));
    expect(before.length).toBeGreaterThan(0);

    const result = await alertsService.evaluate({
      componentIds: allFixtureComponentIds(),
    });

    expect(result.activated).toBe(0);
    expect(result.unchanged).toBeGreaterThan(0);

    const callsAfterReevaluation = recordedNotifications.filter(
      (notification) =>
        notification.entityId === lowStock.id &&
        notification.userId === fixtureUserId,
    ).length;
    expect(callsAfterReevaluation).toBe(callsAfterActivation);

    const after = await db
      .select()
      .from(emailOutbox)
      .where(inArray(emailOutbox.sourceId, allFixtureComponentIds()));
    expect(after.length).toBe(before.length);
  });

  it('queues rendered alert emails without template placeholders or nulls', async () => {
    if (!hasDbUrl) return;

    const rows = await db
      .select()
      .from(emailOutbox)
      .where(inArray(emailOutbox.sourceId, allFixtureComponentIds()));

    const lowStockEmail = rows.find(
      (row) =>
        row.sourceId === lowStock.id &&
        row.eventType === 'inventory.low_stock' &&
        row.recipientUserId === fixtureUserId,
    );
    expect(lowStockEmail).toBeDefined();
    expect(lowStockEmail?.recipientUserId).toBe(fixtureUserId);
    expect(lowStockEmail?.subject).toContain(lowStock.sku);
    expect(lowStockEmail?.bodyHtml).toContain(lowStock.name);
    expect(lowStockEmail?.bodyHtml).not.toContain('{{');
    expect(lowStockEmail?.bodyHtml).not.toContain('undefined');
    expect(lowStockEmail?.bodyHtml).not.toContain('null');
    expect(lowStockEmail?.status).toBe('QUEUED');
  });

  it('delivers queued alerts through the transport and reports provider acceptance', async () => {
    if (!hasDbUrl) return;

    const summary = await mailService.processQueue(50);

    expect(summary.sent).toBeGreaterThan(0);
    expect(transport.captured.length).toBeGreaterThan(0);

    const sentRow = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.sourceId, lowStock.id));
    const fixtureRow = sentRow.find(
      (row) => row.recipientUserId === fixtureUserId,
    );
    expect(fixtureRow?.status).toBe('SENT');
    expect(fixtureRow?.providerMessageId).toBeTruthy();
    expect(fixtureRow?.sentAt).toBeTruthy();
  });

  it('resolves the alert and announces recovery when stock returns above the threshold', async () => {
    if (!hasDbUrl) return;

    await db
      .update(inventoryProjections)
      .set({ quantity: 25 })
      .where(eq(inventoryProjections.componentId, recovering.id));

    const result = await alertsService.evaluate({
      componentIds: [recovering.id],
    });

    expect(result.resolved).toBe(1);

    const [alert] = await db
      .select()
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.componentId, recovering.id));
    expect(alert?.status).toBe('RESOLVED');
    expect(alert?.resolvedAt).toBeTruthy();

    const recoveryCalls = recordedNotifications.filter(
      (notification) =>
        notification.entityId === recovering.id &&
        notification.type === 'STOCK_RECOVERED' &&
        notification.userId === fixtureUserId,
    );
    expect(recoveryCalls).toHaveLength(1);

    const recoveryEmail = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.sourceId, recovering.id));
    expect(
      recoveryEmail.some(
        (row) => row.eventType === 'inventory.stock_recovered',
      ),
    ).toBe(true);
  });

  it('moves an out-of-stock component to low stock without a recovery announcement', async () => {
    if (!hasDbUrl) return;

    await db
      .update(inventoryProjections)
      .set({ quantity: 3 })
      .where(eq(inventoryProjections.componentId, outOfStock.id));

    const result = await alertsService.evaluate({
      componentIds: [outOfStock.id],
    });

    expect(result.activated).toBe(1);
    expect(result.resolved).toBe(1);

    const transitionedAlerts = await db
      .select()
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.componentId, outOfStock.id));
    const activeAlert = transitionedAlerts.find(
      (row) => row.status === 'ACTIVE',
    );
    const resolvedAlert = transitionedAlerts.find(
      (row) => row.status === 'RESOLVED',
    );

    expect(activeAlert?.alertType).toBe('LOW_STOCK');
    expect(resolvedAlert?.alertType).toBe('OUT_OF_STOCK');

    const recoveryCalls = recordedNotifications.filter(
      (notification) =>
        notification.entityId === outOfStock.id &&
        notification.type === 'STOCK_RECOVERED' &&
        notification.userId === fixtureUserId,
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it('keeps failed deliveries observable with bounded retries and redacted errors', async () => {
    if (!hasDbUrl) return;

    transport.failAlways();

    const [queued] = await db
      .insert(emailOutbox)
      .values({
        eventType: 'inventory.low_stock',
        recipientEmail: 'retry-fixture@ananya.test',
        recipientUserId: fixtureUserId,
        subject: 'Retry fixture',
        bodyHtml: '<p>retry</p>',
        bodyText: 'retry',
        status: 'QUEUED',
        attempts: 0,
        maxAttempts: 2,
        nextAttemptAt: new Date(Date.now() - 1000),
        sourceType: 'InventoryAlert',
        sourceId: lowStock.id,
      })
      .returning();

    const firstAttempt = await mailService.processQueue(10);
    expect(firstAttempt.retried).toBeGreaterThanOrEqual(1);

    const [afterFirst] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, queued!.id));
    expect(afterFirst?.status).toBe('QUEUED');
    expect(afterFirst?.attempts).toBe(1);
    expect(afterFirst?.lastError).not.toContain('super-secret');
    expect(afterFirst?.lastError).toContain('[REDACTED]');

    // Make the retry due immediately and let it exhaust maxAttempts.
    await db
      .update(emailOutbox)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(emailOutbox.id, queued!.id));

    const secondAttempt = await mailService.processQueue(10);
    expect(secondAttempt.failed).toBeGreaterThanOrEqual(1);

    const [afterSecond] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, queued!.id));
    expect(afterSecond?.status).toBe('FAILED');
    expect(afterSecond?.attempts).toBe(2);
    expect(afterSecond?.sentAt).toBeNull();
    expect(afterSecond?.lastError).not.toContain('super-secret');
  });

  it('reports active alert counts in the summary', async () => {
    if (!hasDbUrl) return;

    const summary = await alertsService.getSummary();

    expect(summary.active).toBeGreaterThanOrEqual(3);
    expect(summary.lowStock).toBeGreaterThanOrEqual(2);
    expect(summary.outOfStock).toBeGreaterThanOrEqual(0);
  });

  it('lists alerts filtered by component', async () => {
    if (!hasDbUrl) return;

    const alerts = await alertsService.listAlerts({
      componentId: reserved.id,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.alertType).toBe('LOW_STOCK');
  });

  it('does not evaluate inactive or never-stocked components', async () => {
    if (!hasDbUrl) return;

    const inactiveAlerts = await db
      .select()
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.componentId, inactive.id));
    const newAlerts = await db
      .select()
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.componentId, neverStocked.id));

    expect(inactiveAlerts).toEqual([]);
    expect(newAlerts).toEqual([]);
  });

  it('closes an open alert when its component leaves the planning scope', async () => {
    if (!hasDbUrl) return;

    // A component that is retired by consolidation, or deactivated, is excluded
    // from evaluation. Without an explicit close its alert would stay ACTIVE
    // forever, because nothing would ever evaluate the component again.
    deactivated = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-DEACT',
      ),
    );
    consolidated = trackComponent(
      await owner.createComponent(
        componentsService,
        { unit: 'pcs' },
        'ALERT-CONSOL',
      ),
    );

    await db.insert(inventoryProjections).values([
      {
        componentId: deactivated.id,
        locationId: confirmedLocationId,
        quantity: 5,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: consolidated.id,
        locationId: confirmedLocationId,
        quantity: 5,
        unitOfMeasure: 'pcs',
      },
    ]);

    const inScope = await alertsService.evaluate({
      componentIds: [deactivated.id, consolidated.id],
    });
    expect(inScope.activated).toBe(2);

    for (const component of [deactivated, consolidated]) {
      const open = await alertsService.listAlerts({
        componentId: component.id,
        status: 'ACTIVE',
      });
      expect(open).toHaveLength(1);
      expect(open[0]?.alertType).toBe('LOW_STOCK');
    }

    // Deactivation is the state `ComponentsService.update` produces...
    await componentsService.update(deactivated.id, { isActive: false });
    // ...and consolidation retires the source exactly like this (both fields),
    // so the alert engine is exercised against the real post-consolidation state.
    await db
      .update(components)
      .set({
        isActive: false,
        consolidatedIntoComponentId: lowStock.id,
        consolidatedAt: new Date(),
      })
      .where(eq(components.id, consolidated.id));

    const notificationsBefore = recordedNotifications.length;
    const outOfScope = await alertsService.evaluate({
      componentIds: [deactivated.id, consolidated.id],
    });

    expect(outOfScope.resolved).toBe(2);

    for (const component of [deactivated, consolidated]) {
      const open = await alertsService.listAlerts({
        componentId: component.id,
        status: 'ACTIVE',
      });
      expect(open).toEqual([]);

      const resolved = await alertsService.listAlerts({
        componentId: component.id,
        status: 'RESOLVED',
      });
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.resolvedAt).not.toBeNull();
    }

    // Leaving scope is not a recovery: no notification may claim stock is back.
    expect(recordedNotifications).toHaveLength(notificationsBefore);
  });
});
