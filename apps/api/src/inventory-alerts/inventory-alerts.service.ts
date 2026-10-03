import { Injectable, Logger } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  components,
  emailTemplates,
  inventoryAlerts,
  inventoryProjections,
  inventoryReservationLines,
  inventoryReservations,
  locations,
  notificationPreferences,
  organizationProfile,
  roles,
  systemSettings,
  users,
} from '@ananya/database/schema';
import { and, eq, inArray, sql } from '@ananya/database/query';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import {
  INVENTORY_EVENT_TYPES,
  getEventDefinition,
  urlVariableNames,
} from '../email-templates/template-registry';
import { renderEmailContent } from '../email-templates/template-renderer';

export interface EvaluateInventoryAlertsResult {
  evaluatedComponents: number;
  activated: number;
  resolved: number;
  unchanged: number;
  notificationsCreated: number;
  emailsQueued: number;
}

interface ComponentStock {
  onHand: number;
  reserved: number;
}

interface AlertRecipient {
  id: string;
  email: string;
  emailAllowed: boolean;
}

interface AlertComponent {
  id: string;
  name: string;
  sku: string;
  unit: string;
  defaultLocationId: string | null;
}

type DesiredAlertType = 'LOW_STOCK' | 'OUT_OF_STOCK' | null;

const DEFAULT_REORDER_POINT = 10;
const ALERTS_PAGE_URL = '/inventory/alerts';
const RENOTIFY_HOURS = Number.parseInt(
  process.env.INVENTORY_ALERT_RENOTIFY_HOURS ?? '0',
  10,
);

function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function formatUtcTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * Inventory alert evaluation.
 *
 * Semantics (company-wide scope; the product configures a single reorder
 * threshold in system settings):
 *
 *  - OUT_OF_STOCK: on-hand across all locations is zero or less.
 *  - LOW_STOCK: on-hand is positive but available (on-hand minus active
 *    reservations) is at or below the reorder point.
 *  - Components that have never been stocked (no projection rows and no
 *    active alert) are not evaluated, so an empty catalog does not produce
 *    one alert per component.
 *  - A reorder point of zero disables LOW_STOCK; OUT_OF_STOCK still applies.
 *
 * Deduplication: at most one ACTIVE alert per (component, type) enforced by a
 * partial unique index, and notifications are only emitted when an alert opens
 * (or after the optional re-notify window), never on every evaluation.
 */
@Injectable()
export class InventoryAlertsService {
  private readonly logger = new Logger(InventoryAlertsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async evaluate(options?: {
    componentIds?: string[];
  }): Promise<EvaluateInventoryAlertsResult> {
    const result: EvaluateInventoryAlertsResult = {
      evaluatedComponents: 0,
      activated: 0,
      resolved: 0,
      unchanged: 0,
      notificationsCreated: 0,
      emailsQueued: 0,
    };

    const threshold = await this.resolveReorderPoint();
    const companyName = await this.resolveCompanyName();
    const stockByComponent = await this.loadStockByComponent(
      options?.componentIds,
    );
    const loadedAlerts = await this.loadActiveAlerts(options?.componentIds);

    // A component that is deactivated or consolidated away is excluded from
    // evaluation, so nothing would ever close its open alert again. Those are
    // closed here (without a recovery notification: the component is no longer
    // part of stock planning) so a retired component cannot keep a stale
    // LOW_STOCK/OUT_OF_STOCK alert open forever.
    const { alerts: activeAlerts, resolvedCount } =
      await this.closeOutOfScopeAlerts(loadedAlerts);
    result.resolved += resolvedCount;

    const componentsToEvaluate = await this.resolveComponentsToEvaluate(
      stockByComponent,
      activeAlerts,
      options?.componentIds,
    );
    if (componentsToEvaluate.length === 0) {
      return result;
    }

    const locationNames = await this.loadLocationNames(
      componentsToEvaluate.map((component) => component.defaultLocationId),
    );
    const recipients = await this.resolveRecipients();

    const alertsByComponent = new Map<string, typeof activeAlerts>();
    for (const alert of activeAlerts) {
      const list = alertsByComponent.get(alert.componentId) ?? [];
      list.push(alert);
      alertsByComponent.set(alert.componentId, list);
    }

    for (const component of componentsToEvaluate) {
      result.evaluatedComponents += 1;

      const stock = stockByComponent.get(component.id) ?? {
        onHand: 0,
        reserved: 0,
      };
      const available = roundQuantity(
        Math.max(0, stock.onHand - stock.reserved),
      );
      const desiredType = this.resolveDesiredAlertType(
        stock.onHand,
        available,
        threshold,
      );
      const existing = alertsByComponent.get(component.id) ?? [];
      const matching = existing.find(
        (alert) => alert.alertType === desiredType,
      );

      if (desiredType === null) {
        const resolved = await this.resolveAlerts(
          existing.map((alert) => alert.id),
        );
        result.resolved += resolved.length;

        // Recovery is announced only when the component is fully back in
        // normal state, not when it merely moved between alert types.
        if (resolved.length > 0) {
          const counts = await this.notifyRecovery(
            component,
            stock.onHand,
            available,
            threshold,
            companyName,
            locationNames,
            recipients,
          );
          result.notificationsCreated += counts.notifications;
          result.emailsQueued += counts.emails;
        }
        continue;
      }

      if (matching) {
        await db
          .update(inventoryAlerts)
          .set({
            onHandQuantity: stock.onHand.toString(),
            availableQuantity: available.toString(),
            shortageQuantity: this.shortageFor(
              desiredType,
              available,
              stock.onHand,
              threshold,
            ).toString(),
            lastEvaluatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(inventoryAlerts.id, matching.id));
        result.unchanged += 1;

        if (this.shouldRenotify(matching.lastNotifiedAt)) {
          const counts = await this.notifyActivation(
            component,
            desiredType,
            stock.onHand,
            available,
            threshold,
            companyName,
            locationNames,
            recipients,
          );
          result.notificationsCreated += counts.notifications;
          result.emailsQueued += counts.emails;
        }
        continue;
      }

      // Open the alert. The partial unique index makes this race-safe: only the
      // process that actually inserts a row emits notifications.
      const [opened] = await db
        .insert(inventoryAlerts)
        .values({
          componentId: component.id,
          alertType: desiredType,
          status: 'ACTIVE',
          thresholdQuantity: threshold.toString(),
          onHandQuantity: stock.onHand.toString(),
          availableQuantity: available.toString(),
          shortageQuantity: this.shortageFor(
            desiredType,
            available,
            stock.onHand,
            threshold,
          ).toString(),
          lastEvaluatedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [inventoryAlerts.componentId, inventoryAlerts.alertType],
          where: sql`${inventoryAlerts.status} = 'ACTIVE'`,
        })
        .returning();

      if (!opened) {
        // Another evaluation opened the same alert concurrently.
        result.unchanged += 1;
        continue;
      }

      result.activated += 1;

      const otherTypeAlerts = existing.filter(
        (alert) => alert.alertType !== desiredType,
      );
      if (otherTypeAlerts.length > 0) {
        const resolved = await this.resolveAlerts(
          otherTypeAlerts.map((alert) => alert.id),
        );
        result.resolved += resolved.length;
      }

      const counts = await this.notifyActivation(
        component,
        desiredType,
        stock.onHand,
        available,
        threshold,
        companyName,
        locationNames,
        recipients,
      );
      result.notificationsCreated += counts.notifications;
      result.emailsQueued += counts.emails;
    }

    return result;
  }

  async listAlerts(options?: {
    status?: 'ACTIVE' | 'RESOLVED';
    alertType?: string;
    componentId?: string;
    limit?: number;
  }) {
    const conditions = [];
    if (options?.status) {
      conditions.push(eq(inventoryAlerts.status, options.status));
    }
    if (options?.alertType) {
      conditions.push(eq(inventoryAlerts.alertType, options.alertType));
    }
    if (options?.componentId) {
      conditions.push(eq(inventoryAlerts.componentId, options.componentId));
    }

    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    return db
      .select()
      .from(inventoryAlerts)
      .where(and(...conditions))
      .orderBy(inventoryAlerts.lastEvaluatedAt)
      .limit(limit);
  }

  async getSummary(): Promise<{
    active: number;
    lowStock: number;
    outOfStock: number;
  }> {
    const rows = await db
      .select({
        alertType: inventoryAlerts.alertType,
        total: sql<string>`COUNT(*)`,
      })
      .from(inventoryAlerts)
      .where(eq(inventoryAlerts.status, 'ACTIVE'))
      .groupBy(inventoryAlerts.alertType);

    let active = 0;
    let lowStock = 0;
    let outOfStock = 0;
    for (const row of rows) {
      const total = Number(row.total);
      active += total;
      if (row.alertType === 'LOW_STOCK') lowStock += total;
      if (row.alertType === 'OUT_OF_STOCK') outOfStock += total;
    }
    return { active, lowStock, outOfStock };
  }

  // ---------------------------------------------------------------------------
  // Stock semantics
  // ---------------------------------------------------------------------------

  private async resolveReorderPoint(): Promise<number> {
    const [settings] = await db.select().from(systemSettings).limit(1);
    const configured = settings?.reorderDefaultsJson?.minStockLevel;
    return typeof configured === 'number' && Number.isFinite(configured)
      ? configured
      : DEFAULT_REORDER_POINT;
  }

  private async resolveCompanyName(): Promise<string> {
    const [profile] = await db.select().from(organizationProfile).limit(1);
    return profile?.companyName?.trim() || 'Ananya ERP';
  }

  private async loadStockByComponent(
    componentIds?: string[],
  ): Promise<Map<string, ComponentStock>> {
    const onHandConditions = componentIds?.length
      ? inArray(inventoryProjections.componentId, componentIds)
      : undefined;
    const reservationConditions = [
      eq(inventoryReservations.status, 'ACTIVE'),
      inArray(inventoryReservations.reservationType, [
        'WORK_ORDER',
        'SALES_ORDER',
        'PROJECT',
      ]),
    ];
    if (componentIds?.length) {
      reservationConditions.push(
        inArray(inventoryReservationLines.componentId, componentIds),
      );
    }

    const [onHandRows, reservedRows] = await Promise.all([
      db
        .select({
          componentId: inventoryProjections.componentId,
          quantity: sql<string>`COALESCE(SUM(${inventoryProjections.quantity}), 0)`,
        })
        .from(inventoryProjections)
        .where(onHandConditions)
        .groupBy(inventoryProjections.componentId),
      db
        .select({
          componentId: inventoryReservationLines.componentId,
          quantity: sql<string>`COALESCE(SUM(${inventoryReservationLines.reservedQuantity} - ${inventoryReservationLines.fulfilledQuantity}), 0)`,
        })
        .from(inventoryReservationLines)
        .innerJoin(
          inventoryReservations,
          eq(inventoryReservationLines.reservationId, inventoryReservations.id),
        )
        .where(and(...reservationConditions))
        .groupBy(inventoryReservationLines.componentId),
    ]);

    const stock = new Map<string, ComponentStock>();
    for (const row of onHandRows) {
      stock.set(row.componentId, {
        onHand: roundQuantity(parseFloat(row.quantity ?? '0')),
        reserved: 0,
      });
    }
    for (const row of reservedRows) {
      const current = stock.get(row.componentId) ?? { onHand: 0, reserved: 0 };
      current.reserved = roundQuantity(parseFloat(row.quantity ?? '0'));
      stock.set(row.componentId, current);
    }
    return stock;
  }

  private resolveDesiredAlertType(
    onHand: number,
    available: number,
    threshold: number,
  ): DesiredAlertType {
    if (onHand <= 0) return 'OUT_OF_STOCK';
    if (threshold > 0 && available <= threshold) return 'LOW_STOCK';
    return null;
  }

  private shortageFor(
    type: DesiredAlertType,
    available: number,
    onHand: number,
    threshold: number,
  ): number {
    if (type === 'OUT_OF_STOCK') {
      return roundQuantity(Math.max(threshold - onHand, 0));
    }
    return roundQuantity(Math.max(threshold - available, 0));
  }

  private shouldRenotify(lastNotifiedAt: Date | null): boolean {
    if (!Number.isFinite(RENOTIFY_HOURS) || RENOTIFY_HOURS <= 0) return false;
    if (!lastNotifiedAt) return true;
    return Date.now() - lastNotifiedAt.getTime() >= RENOTIFY_HOURS * 3_600_000;
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private async loadActiveAlerts(componentIds?: string[]) {
    const conditions = [eq(inventoryAlerts.status, 'ACTIVE')];
    if (componentIds?.length) {
      conditions.push(inArray(inventoryAlerts.componentId, componentIds));
    }
    return db
      .select()
      .from(inventoryAlerts)
      .where(and(...conditions));
  }

  /**
   * Closes open alerts whose component left the planning scope.
   *
   * `resolveComponentsToEvaluate` only returns active, non-consolidated
   * components, so without this an alert opened before a component was
   * deactivated or consolidated away would stay ACTIVE forever.
   */
  private async closeOutOfScopeAlerts<
    T extends { id: string; componentId: string },
  >(activeAlerts: T[]): Promise<{ alerts: T[]; resolvedCount: number }> {
    if (activeAlerts.length === 0) {
      return { alerts: activeAlerts, resolvedCount: 0 };
    }

    const componentIds = [...new Set(activeAlerts.map((a) => a.componentId))];
    const rows = await db
      .select({
        id: components.id,
        isActive: components.isActive,
        consolidatedIntoComponentId: components.consolidatedIntoComponentId,
      })
      .from(components)
      .where(inArray(components.id, componentIds));

    const outOfScope = new Set(
      rows
        .filter(
          (row) => !row.isActive || row.consolidatedIntoComponentId !== null,
        )
        .map((row) => row.id),
    );
    if (outOfScope.size === 0) {
      return { alerts: activeAlerts, resolvedCount: 0 };
    }

    const stale = activeAlerts.filter((alert) =>
      outOfScope.has(alert.componentId),
    );
    if (stale.length === 0) {
      return { alerts: activeAlerts, resolvedCount: 0 };
    }

    const resolved = await this.resolveAlerts(stale.map((alert) => alert.id));
    const resolvedIds = new Set(resolved.map((alert) => alert.id));
    return {
      alerts: activeAlerts.filter((alert) => !resolvedIds.has(alert.id)),
      resolvedCount: resolved.length,
    };
  }

  private async resolveComponentsToEvaluate(
    stockByComponent: Map<string, ComponentStock>,
    activeAlerts: Array<{ componentId: string }>,
    componentIds?: string[],
  ): Promise<AlertComponent[]> {
    // Only components that have been stocked (projection rows) or already have
    // an active alert are candidates; `componentIds` narrows that set rather
    // than forcing evaluation of never-stocked components.
    const stocked = new Set<string>([
      ...stockByComponent.keys(),
      ...activeAlerts.map((alert) => alert.componentId),
    ]);
    const requested = componentIds?.length ? new Set(componentIds) : null;
    const candidates = [...stocked].filter(
      (componentId) => !requested || requested.has(componentId),
    );
    if (candidates.length === 0) return [];

    return db
      .select({
        id: components.id,
        name: components.name,
        sku: components.sku,
        unit: components.unit,
        defaultLocationId: components.defaultLocationId,
      })
      .from(components)
      .where(
        and(
          eq(components.isActive, true),
          sql`${components.consolidatedIntoComponentId} IS NULL`,
          inArray(components.id, candidates),
        ),
      );
  }

  private async loadLocationNames(
    locationIds: Array<string | null>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(locationIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();

    const rows = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, ids));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async resolveRecipients(): Promise<AlertRecipient[]> {
    const [roleRows, userRows, preferenceRows] = await Promise.all([
      db.select().from(roles),
      db.select().from(users).where(eq(users.status, 'ACTIVE')),
      db.select().from(notificationPreferences),
    ]);

    const inventoryRoleIds = new Set(
      roleRows
        .filter((role) => {
          const permissions = role.permissions;
          if (!Array.isArray(permissions)) return false;
          return (
            permissions.includes('Inventory.Read') || permissions.includes('*')
          );
        })
        .map((role) => role.id),
    );

    const preferencesByUser = new Map(
      preferenceRows.map((preference) => [preference.userId, preference]),
    );

    return userRows
      .filter((user) => {
        const secondary = Array.isArray(user.secondaryRoleIds)
          ? (user.secondaryRoleIds as string[])
          : [];
        return (
          (user.roleId !== null && inventoryRoleIds.has(user.roleId)) ||
          secondary.some((roleId) => inventoryRoleIds.has(roleId))
        );
      })
      .map((user) => {
        const preference = preferencesByUser.get(user.id);
        const categoryEnabled =
          !preference?.categoriesJson ||
          preference.categoriesJson.Inventory !== false;
        const emailAllowed =
          preference?.emailEnabled !== false &&
          categoryEnabled &&
          !this.isWithinQuietHours(preference ?? null);
        return { id: user.id, email: user.email, emailAllowed };
      });
  }

  private isWithinQuietHours(
    preference: {
      quietHoursEnabled: boolean;
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
    } | null,
  ): boolean {
    if (!preference?.quietHoursEnabled) return false;
    const start = this.parseMinutes(preference.quietHoursStart);
    const end = this.parseMinutes(preference.quietHoursEnd);
    if (start === null || end === null) return false;

    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    if (start === end) return false;
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
  }

  private parseMinutes(value: string | null): number | null {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hours = Number.parseInt(match[1] ?? '', 10);
    const minutes = Number.parseInt(match[2] ?? '', 10);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  // ---------------------------------------------------------------------------
  // Side effects
  // ---------------------------------------------------------------------------

  private async resolveAlerts(alertIds: string[]) {
    if (alertIds.length === 0) return [];
    return db
      .update(inventoryAlerts)
      .set({
        status: 'RESOLVED',
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(inventoryAlerts.id, alertIds),
          eq(inventoryAlerts.status, 'ACTIVE'),
        ),
      )
      .returning();
  }

  private async notifyActivation(
    component: AlertComponent,
    alertType: 'LOW_STOCK' | 'OUT_OF_STOCK',
    onHand: number,
    available: number,
    threshold: number,
    companyName: string,
    locationNames: Map<string, string>,
    recipients: AlertRecipient[],
  ): Promise<{ notifications: number; emails: number }> {
    const isOutOfStock = alertType === 'OUT_OF_STOCK';
    const eventType = isOutOfStock
      ? INVENTORY_EVENT_TYPES.OUT_OF_STOCK
      : INVENTORY_EVENT_TYPES.LOW_STOCK;
    const title = isOutOfStock
      ? `Out of stock: ${component.name}`
      : `Low stock: ${component.name}`;
    const message = isOutOfStock
      ? `${component.sku} has no on-hand stock (available ${available} ${component.unit}, reorder point ${threshold}).`
      : `${component.sku} is at or below its reorder point (available ${available} ${component.unit}, reorder point ${threshold}).`;

    let notifications = 0;
    let emails = 0;

    const context = {
      company_name: companyName,
      event_name: isOutOfStock ? 'Out of stock' : 'Low stock',
      component_name: component.name,
      component_sku: component.sku,
      location_name: this.locationNameFor(component, locationNames),
      quantity_on_hand: String(onHand),
      quantity_available: String(available),
      reorder_point: String(threshold),
      shortage_quantity: String(
        this.shortageFor(alertType, available, onHand, threshold),
      ),
      occurred_at: formatUtcTimestamp(new Date()),
      alert_url: `/inventory/components/${component.id}`,
      alerts_url: ALERTS_PAGE_URL,
    };

    for (const recipient of recipients) {
      await this.notificationsService.createNotification({
        userId: recipient.id,
        module: 'Inventory',
        type: alertType,
        title,
        message,
        entityType: 'Component',
        entityId: component.id,
        priority: isOutOfStock ? 'URGENT' : 'HIGH',
      });
      notifications += 1;

      if (recipient.emailAllowed) {
        const queued = await this.enqueueAlertEmail(
          eventType,
          recipient,
          context,
          component.id,
        );
        if (queued) emails += 1;
      }
    }

    await this.markNotified(component.id, alertType);
    return { notifications, emails };
  }

  private async notifyRecovery(
    component: AlertComponent,
    onHand: number,
    available: number,
    threshold: number,
    companyName: string,
    locationNames: Map<string, string>,
    recipients: AlertRecipient[],
  ): Promise<{ notifications: number; emails: number }> {
    const title = `Stock recovered: ${component.name}`;
    const message = `${component.sku} is back above its reorder point (available ${available} ${component.unit}, reorder point ${threshold}).`;

    let notifications = 0;
    let emails = 0;

    const context = {
      company_name: companyName,
      event_name: 'Stock recovered',
      component_name: component.name,
      component_sku: component.sku,
      location_name: this.locationNameFor(component, locationNames),
      quantity_on_hand: String(onHand),
      quantity_available: String(available),
      reorder_point: String(threshold),
      occurred_at: formatUtcTimestamp(new Date()),
      alert_url: `/inventory/components/${component.id}`,
      alerts_url: ALERTS_PAGE_URL,
    };

    for (const recipient of recipients) {
      await this.notificationsService.createNotification({
        userId: recipient.id,
        module: 'Inventory',
        type: 'STOCK_RECOVERED',
        title,
        message,
        entityType: 'Component',
        entityId: component.id,
        priority: 'NORMAL',
      });
      notifications += 1;

      if (recipient.emailAllowed) {
        const queued = await this.enqueueAlertEmail(
          INVENTORY_EVENT_TYPES.STOCK_RECOVERED,
          recipient,
          context,
          component.id,
        );
        if (queued) emails += 1;
      }
    }

    return { notifications, emails };
  }

  private async markNotified(
    componentId: string,
    alertType: string,
  ): Promise<void> {
    await db
      .update(inventoryAlerts)
      .set({
        lastNotifiedAt: new Date(),
        notificationCount: sql`${inventoryAlerts.notificationCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryAlerts.componentId, componentId),
          eq(inventoryAlerts.alertType, alertType),
          eq(inventoryAlerts.status, 'ACTIVE'),
        ),
      );
  }

  private async enqueueAlertEmail(
    eventType: string,
    recipient: AlertRecipient,
    context: Record<string, string>,
    componentId: string,
  ): Promise<boolean> {
    if (!getEventDefinition(eventType)) return false;

    const rendered = await this.renderTemplate(eventType, context);
    if (!rendered) return false;

    const queued = await this.mailService.enqueue({
      eventType,
      to: recipient.email,
      userId: recipient.id,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      sourceType: 'InventoryAlert',
      sourceId: componentId,
    });

    return queued !== null;
  }

  private async renderTemplate(
    eventType: string,
    context: Record<string, string>,
  ): Promise<{ subject: string; html: string; text: string } | null> {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.eventType, eventType));

    if (!template || !template.isEnabled) return null;

    return renderEmailContent(
      {
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
      },
      context,
      urlVariableNames(eventType),
    );
  }

  private locationNameFor(
    component: { defaultLocationId: string | null },
    locationNames: Map<string, string>,
  ): string {
    if (!component.defaultLocationId) return 'All locations';
    return locationNames.get(component.defaultLocationId) ?? 'All locations';
  }
}
