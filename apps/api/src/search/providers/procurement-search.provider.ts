import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  suppliers,
  purchaseOrders,
  goodsReceipts,
  supplierReturns,
} from '@ananya/database/schema';
import { or, ilike } from '@ananya/database/query';
import {
  ISearchProvider,
  SearchCategory,
  SearchResultItem,
} from '../search.types';

@Injectable()
export class ProcurementSearchProvider implements ISearchProvider {
  readonly category: SearchCategory = 'Procurement';

  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const term = `%${query}%`;
    const results: SearchResultItem[] = [];

    // Search Suppliers
    const supRows = await db
      .select()
      .from(suppliers)
      .where(or(ilike(suppliers.name, term), ilike(suppliers.code, term)))
      .limit(limit);

    for (const s of supRows) {
      results.push({
        id: s.id,
        type: 'Supplier',
        category: 'Procurement',
        title: s.name,
        subtitle: `Code: ${s.code} | Terms: ${s.paymentTerms}`,
        status: s.isActive ? 'ACTIVE' : 'INACTIVE',
        href: `/suppliers/${s.id}`,
        iconName: 'Truck',
      });
    }

    // Search Purchase Orders
    const poRows = await db
      .select()
      .from(purchaseOrders)
      .where(ilike(purchaseOrders.poNumber, term))
      .limit(limit);

    for (const po of poRows) {
      results.push({
        id: po.id,
        type: 'Purchase Order',
        category: 'Procurement',
        title: `PO: ${po.poNumber}`,
        subtitle: `Currency: ${po.currency} | Total: ${po.grandTotal}`,
        status: po.status,
        href: `/purchase-orders/${po.id}`,
        iconName: 'ShoppingCart',
      });
    }

    // Search Goods Receipts
    const grRows = await db
      .select()
      .from(goodsReceipts)
      .where(ilike(goodsReceipts.grNumber, term))
      .limit(limit);

    for (const gr of grRows) {
      results.push({
        id: gr.id,
        type: 'Goods Receipt',
        category: 'Procurement',
        title: `GR: ${gr.grNumber}`,
        subtitle: `Received Date: ${new Date(gr.receivedAt).toLocaleDateString()}`,
        status: gr.status,
        href: `/goods-receipts/${gr.id}`,
        iconName: 'ArrowDownLeft',
      });
    }

    // Search Supplier Returns
    const retRows = await db
      .select()
      .from(supplierReturns)
      .where(ilike(supplierReturns.returnNumber, term))
      .limit(limit);

    for (const r of retRows) {
      results.push({
        id: r.id,
        type: 'Supplier Return',
        category: 'Procurement',
        title: `Return: ${r.returnNumber}`,
        subtitle: `Amount: $${r.totalAmount}`,
        status: r.status,
        href: `/supplier-returns/${r.id}`,
        iconName: 'ArrowUpRight',
      });
    }

    return results;
  }
}
