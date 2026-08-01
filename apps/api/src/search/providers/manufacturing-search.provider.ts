import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { billOfMaterials, productionOrders } from '@ananya/database/schema';
import { ilike } from '@ananya/database/query';
import {
  ISearchProvider,
  SearchCategory,
  SearchResultItem,
} from '../search.types';

@Injectable()
export class ManufacturingSearchProvider implements ISearchProvider {
  readonly category: SearchCategory = 'Manufacturing';

  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const term = `%${query}%`;
    const results: SearchResultItem[] = [];

    // Search BOMs
    const bomRows = await db
      .select()
      .from(billOfMaterials)
      .where(ilike(billOfMaterials.revision, term))
      .limit(limit);

    for (const b of bomRows) {
      results.push({
        id: b.id,
        type: 'BOM',
        category: 'Manufacturing',
        title: `BOM Specification (Rev: ${b.revision})`,
        subtitle: `Revision: ${b.revision} | Status: ${b.status}`,
        status: b.status,
        href: `/boms/${b.id}`,
        iconName: 'Factory',
      });
    }

    // Search Production Orders / Work Orders
    const poRows = await db
      .select()
      .from(productionOrders)
      .where(ilike(productionOrders.productionNumber, term))
      .limit(limit);

    for (const po of poRows) {
      results.push({
        id: po.id,
        type: 'Work Order',
        category: 'Manufacturing',
        title: `Work Order: ${po.productionNumber}`,
        subtitle: `Planned Qty: ${po.quantityPlanned} | Priority: ${po.priority}`,
        status: po.status,
        href: `/work-orders/${po.id}`,
        iconName: 'Wrench',
      });
    }

    return results;
  }
}
