import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  components,
  locations,
  manufacturers,
  categories,
  stockAdjustments,
  inventoryReservations,
  warehouseTransfers,
} from '@ananya/database/schema';
import { or, ilike } from '@ananya/database/query';
import {
  ISearchProvider,
  SearchCategory,
  SearchResultItem,
} from '../search.types';

@Injectable()
export class InventorySearchProvider implements ISearchProvider {
  readonly category: SearchCategory = 'Inventory';

  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const term = `%${query}%`;
    const results: SearchResultItem[] = [];

    // Search Components by SKU or Name
    const compRows = await db
      .select()
      .from(components)
      .where(or(ilike(components.name, term), ilike(components.sku, term)))
      .limit(limit);

    for (const c of compRows) {
      results.push({
        id: c.id,
        type: 'Component',
        category: 'Inventory',
        title: c.name,
        subtitle: `SKU: ${c.sku} | Unit: ${c.unit}`,
        status: c.isActive ? 'ACTIVE' : 'INACTIVE',
        href: `/components/${c.id}`,
        iconName: 'Boxes',
      });
    }

    // Search Locations by Name or Code
    const locRows = await db
      .select()
      .from(locations)
      .where(or(ilike(locations.name, term), ilike(locations.code, term)))
      .limit(limit);

    for (const l of locRows) {
      results.push({
        id: l.id,
        type: 'Location',
        category: 'Inventory',
        title: l.name,
        subtitle: `Code: ${l.code} | Kind: ${l.kind}`,
        status: l.isActive ? 'ACTIVE' : 'INACTIVE',
        href: `/locations/${l.id}`,
        iconName: 'MapPin',
      });
    }

    // Search Manufacturers
    const mfgRows = await db
      .select()
      .from(manufacturers)
      .where(
        or(ilike(manufacturers.name, term), ilike(manufacturers.code, term)),
      )
      .limit(limit);

    for (const m of mfgRows) {
      results.push({
        id: m.id,
        type: 'Manufacturer',
        category: 'Inventory',
        title: m.name,
        subtitle: `Code: ${m.code}`,
        status: m.isActive ? 'ACTIVE' : 'INACTIVE',
        href: `/manufacturers/${m.id}`,
        iconName: 'Building2',
      });
    }

    // Search Categories
    const catRows = await db
      .select()
      .from(categories)
      .where(ilike(categories.name, term))
      .limit(limit);

    for (const cat of catRows) {
      results.push({
        id: cat.id,
        type: 'Category',
        category: 'Inventory',
        title: cat.name,
        subtitle: cat.description || 'Component Category',
        href: `/categories/${cat.id}`,
        iconName: 'Tag',
      });
    }

    // Search Stock Adjustments
    const adjRows = await db
      .select()
      .from(stockAdjustments)
      .where(
        or(
          ilike(stockAdjustments.adjustmentNumber, term),
          ilike(stockAdjustments.reason, term),
        ),
      )
      .limit(limit);

    for (const a of adjRows) {
      results.push({
        id: a.id,
        type: 'Stock Adjustment',
        category: 'Inventory',
        title: a.adjustmentNumber,
        subtitle: `Reason: ${a.reason}`,
        status: a.status,
        href: `/stock-adjustments/${a.id}`,
        iconName: 'ClipboardList',
      });
    }

    // Search Reservations
    const resRows = await db
      .select()
      .from(inventoryReservations)
      .where(
        or(
          ilike(inventoryReservations.reservationNumber, term),
          ilike(inventoryReservations.reservedBy, term),
        ),
      )
      .limit(limit);

    for (const r of resRows) {
      results.push({
        id: r.id,
        type: 'Reservation',
        category: 'Inventory',
        title: r.reservationNumber,
        subtitle: `Type: ${r.reservationType} | By: ${r.reservedBy}`,
        status: r.status,
        href: `/reservations/${r.id}`,
        iconName: 'PackageCheck',
      });
    }

    // Search Warehouse Transfers
    const transferRows = await db
      .select()
      .from(warehouseTransfers)
      .where(ilike(warehouseTransfers.transferNumber, term))
      .limit(limit);

    for (const t of transferRows) {
      results.push({
        id: t.id,
        type: 'Warehouse Transfer',
        category: 'Inventory',
        title: t.transferNumber,
        subtitle: `Transfer #: ${t.transferNumber} | Status: ${t.status}`,
        status: t.status,
        href: `/warehouse-transfers/${t.id}`,
        iconName: 'ArrowRightLeft',
      });
    }

    return results;
  }
}
