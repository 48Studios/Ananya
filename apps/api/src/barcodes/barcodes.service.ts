import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  components,
  locations,
  purchaseOrders,
  productionOrders,
  projects,
} from '@ananya/database/schema';
import { eq, or, ilike } from '@ananya/database/query';

export type EntityType =
  'COMPONENT' | 'LOCATION' | 'WORK_ORDER' | 'PURCHASE_ORDER' | 'PROJECT';

export interface BarcodeLookupResult {
  found: boolean;
  entityType: EntityType;
  entityId: string;
  code: string;
  qrPayload: string;
  name: string;
  subtitle: string;
  targetUrl: string;
  details: Record<string, unknown>;
}

export interface LabelData {
  id: string;
  entityType: EntityType;
  primaryCode: string;
  qrPayload: string;
  title: string;
  subtitle: string;
  attribute1?: string;
  attribute2?: string;
}

@Injectable()
export class BarcodesService {
  async lookup(rawCode: string): Promise<BarcodeLookupResult> {
    const code = rawCode.trim();
    if (!code) {
      throw new NotFoundException(
        'Barcode or QR input string cannot be empty.',
      );
    }

    // 1. Check if input is a structured QR payload: ANANYA:V1:TYPE:IDENTIFIER
    if (code.startsWith('ANANYA:V1:')) {
      const parts = code.split(':');
      if (parts.length >= 4) {
        const type = parts[2]?.toUpperCase();
        const identifier = parts.slice(3).join(':');

        if (type === 'COMPONENT') return this.lookupComponent(identifier);
        if (type === 'LOCATION') return this.lookupLocation(identifier);
        if (type === 'WORK_ORDER') return this.lookupWorkOrder(identifier);
        if (type === 'PURCHASE_ORDER')
          return this.lookupPurchaseOrder(identifier);
        if (type === 'PROJECT') return this.lookupProject(identifier);
      }
    }

    // 2. Try Component lookup by SKU or ID
    try {
      return await this.lookupComponent(code);
    } catch {
      // Continue next entity lookup
    }

    // 3. Try Location lookup by code or ID
    try {
      return await this.lookupLocation(code);
    } catch {
      // Continue
    }

    // 4. Try Purchase Order lookup by PO number or ID
    try {
      return await this.lookupPurchaseOrder(code);
    } catch {
      // Continue
    }

    // 5. Try Work Order / Production Order lookup by Production number or ID
    try {
      return await this.lookupWorkOrder(code);
    } catch {
      // Continue
    }

    // 6. Try Project lookup by Project number or ID
    try {
      return await this.lookupProject(code);
    } catch {
      // Continue
    }

    throw new NotFoundException(
      `No entity matched the scanned code or QR identifier "${code}".`,
    );
  }

  private async lookupComponent(
    identifier: string,
  ): Promise<BarcodeLookupResult> {
    const [comp] = await db
      .select()
      .from(components)
      .where(
        or(eq(components.id, identifier), ilike(components.sku, identifier)),
      )
      .limit(1);

    if (!comp) {
      throw new NotFoundException(`Component "${identifier}" not found.`);
    }

    return {
      found: true,
      entityType: 'COMPONENT',
      entityId: comp.id,
      code: comp.sku,
      qrPayload: `ANANYA:V1:COMPONENT:${comp.id}`,
      name: comp.name,
      subtitle: `SKU: ${comp.sku} | Unit: ${comp.unit}`,
      targetUrl: `/components/${comp.id}`,
      details: {
        sku: comp.sku,
        unit: comp.unit,
        isActive: comp.isActive,
        description: comp.description,
      },
    };
  }

  private async lookupLocation(
    identifier: string,
  ): Promise<BarcodeLookupResult> {
    const [loc] = await db
      .select()
      .from(locations)
      .where(
        or(eq(locations.id, identifier), ilike(locations.code, identifier)),
      )
      .limit(1);

    if (!loc) {
      throw new NotFoundException(`Location "${identifier}" not found.`);
    }

    return {
      found: true,
      entityType: 'LOCATION',
      entityId: loc.id,
      code: loc.code,
      qrPayload: `ANANYA:V1:LOCATION:${loc.id}`,
      name: loc.name,
      subtitle: `Code: ${loc.code} | Kind: ${loc.kind}`,
      targetUrl: `/locations/${loc.id}`,
      details: {
        code: loc.code,
        kind: loc.kind,
      },
    };
  }

  private async lookupPurchaseOrder(
    identifier: string,
  ): Promise<BarcodeLookupResult> {
    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(
        or(
          eq(purchaseOrders.id, identifier),
          ilike(purchaseOrders.poNumber, identifier),
        ),
      )
      .limit(1);

    if (!po) {
      throw new NotFoundException(`Purchase Order "${identifier}" not found.`);
    }

    return {
      found: true,
      entityType: 'PURCHASE_ORDER',
      entityId: po.id,
      code: po.poNumber,
      qrPayload: `ANANYA:V1:PURCHASE_ORDER:${po.id}`,
      name: po.poNumber,
      subtitle: `Status: ${po.status} | Total: $${parseFloat(po.grandTotal).toFixed(2)}`,
      targetUrl: `/purchase-orders/${po.id}`,
      details: {
        poNumber: po.poNumber,
        status: po.status,
        grandTotal: po.grandTotal,
      },
    };
  }

  private async lookupWorkOrder(
    identifier: string,
  ): Promise<BarcodeLookupResult> {
    const [wo] = await db
      .select()
      .from(productionOrders)
      .where(
        or(
          eq(productionOrders.id, identifier),
          ilike(productionOrders.productionNumber, identifier),
        ),
      )
      .limit(1);

    if (!wo) {
      throw new NotFoundException(`Work Order "${identifier}" not found.`);
    }

    return {
      found: true,
      entityType: 'WORK_ORDER',
      entityId: wo.id,
      code: wo.productionNumber,
      qrPayload: `ANANYA:V1:WORK_ORDER:${wo.id}`,
      name: wo.productionNumber,
      subtitle: `Status: ${wo.status} | Planned: ${wo.quantityPlanned} units`,
      targetUrl: `/work-orders/${wo.id}`,
      details: {
        productionNumber: wo.productionNumber,
        status: wo.status,
        quantityPlanned: wo.quantityPlanned,
        quantityCompleted: wo.quantityCompleted,
      },
    };
  }

  private async lookupProject(
    identifier: string,
  ): Promise<BarcodeLookupResult> {
    const [proj] = await db
      .select()
      .from(projects)
      .where(
        or(
          eq(projects.id, identifier),
          ilike(projects.projectNumber, identifier),
        ),
      )
      .limit(1);

    if (!proj) {
      throw new NotFoundException(`Project "${identifier}" not found.`);
    }

    return {
      found: true,
      entityType: 'PROJECT',
      entityId: proj.id,
      code: proj.projectNumber,
      qrPayload: `ANANYA:V1:PROJECT:${proj.id}`,
      name: proj.name,
      subtitle: `Project #${proj.projectNumber} | Manager: ${proj.projectManager}`,
      targetUrl: `/projects/${proj.id}`,
      details: {
        projectNumber: proj.projectNumber,
        status: proj.status,
        projectManager: proj.projectManager,
      },
    };
  }

  async generateBarcodePayload(entityType: EntityType, entityId: string) {
    let result: BarcodeLookupResult;
    if (entityType === 'COMPONENT')
      result = await this.lookupComponent(entityId);
    else if (entityType === 'LOCATION')
      result = await this.lookupLocation(entityId);
    else if (entityType === 'PURCHASE_ORDER')
      result = await this.lookupPurchaseOrder(entityId);
    else if (entityType === 'WORK_ORDER')
      result = await this.lookupWorkOrder(entityId);
    else if (entityType === 'PROJECT')
      result = await this.lookupProject(entityId);
    else throw new NotFoundException('Unsupported entity type.');

    return {
      entityType,
      entityId: result.entityId,
      primaryCode: result.code,
      qrPayload: result.qrPayload,
      title: result.name,
      subtitle: result.subtitle,
    };
  }

  async getBatchLabels(
    entityType: EntityType,
    ids: string[],
  ): Promise<LabelData[]> {
    const labels: LabelData[] = [];
    for (const id of ids) {
      try {
        const payload = await this.generateBarcodePayload(entityType, id);
        labels.push({
          id: payload.entityId,
          entityType: payload.entityType,
          primaryCode: payload.primaryCode,
          qrPayload: payload.qrPayload,
          title: payload.title,
          subtitle: payload.subtitle,
        });
      } catch {
        // Skip unresolvable entity
      }
    }
    return labels;
  }
}
