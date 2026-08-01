import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  components,
  locations,
  suppliers,
  purchaseOrders,
  goodsReceipts,
  productionOrders,
  billOfMaterials,
  projects,
  projectMaterials,
  inventoryTransactions,
  inventoryReservations,
  stockAdjustments,
  warehouseTransfers,
} from '@ananya/database/schema';
import { count, eq, sql } from '@ananya/database/query';

@Injectable()
export class ReportingService {
  async getOverviewMetrics() {
    const [compCount] = await db.select({ count: count() }).from(components);
    const [locCount] = await db.select({ count: count() }).from(locations);
    const [poCount] = await db.select({ count: count() }).from(purchaseOrders);
    const [woCount] = await db
      .select({ count: count() })
      .from(productionOrders);
    const [projCount] = await db.select({ count: count() }).from(projects);
    const [txCount] = await db
      .select({ count: count() })
      .from(inventoryTransactions);

    const [totalSpend] = await db
      .select({ total: sql<string>`COALESCE(SUM(grand_total), 0)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'FULFILLED'));

    return {
      totalComponents: Number(compCount?.count ?? 0),
      totalLocations: Number(locCount?.count ?? 0),
      totalPurchaseOrders: Number(poCount?.count ?? 0),
      totalWorkOrders: Number(woCount?.count ?? 0),
      totalProjects: Number(projCount?.count ?? 0),
      totalTransactions: Number(txCount?.count ?? 0),
      totalProcurementSpend: parseFloat(totalSpend?.total ?? '0.00'),
    };
  }

  async getInventorySummary() {
    const [totalComp] = await db.select({ count: count() }).from(components);
    const [activeComp] = await db
      .select({ count: count() })
      .from(components)
      .where(eq(components.isActive, true));

    const [activeLoc] = await db.select({ count: count() }).from(locations);

    const [resvCount] = await db
      .select({
        total: sql<string>`COALESCE(SUM(reserved_quantity), 0)`,
      })
      .from(inventoryReservations)
      .where(eq(inventoryReservations.status, 'ACTIVE'));

    // Count adjustments & transfers for activity summary
    const [adjCount] = await db
      .select({ count: count() })
      .from(stockAdjustments);
    const [transferCount] = await db
      .select({ count: count() })
      .from(warehouseTransfers);

    return {
      totalComponents: Number(totalComp?.count ?? 0),
      activeComponents: Number(activeComp?.count ?? 0),
      activeLocations: Number(activeLoc?.count ?? 0),
      reservedQuantity: parseFloat(resvCount?.total ?? '0'),
      totalAdjustments: Number(adjCount?.count ?? 0),
      totalTransfers: Number(transferCount?.count ?? 0),
    };
  }

  async getProcurementSummary() {
    const [totalPo] = await db.select({ count: count() }).from(purchaseOrders);
    const [activePo] = await db
      .select({ count: count() })
      .from(purchaseOrders)
      .where(
        sql`status IN ('SUBMITTED', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED')`,
      );
    const [totalSuppliers] = await db
      .select({ count: count() })
      .from(suppliers);
    const [totalGrn] = await db.select({ count: count() }).from(goodsReceipts);

    const [fulfilledSpend] = await db
      .select({ total: sql<string>`COALESCE(SUM(grand_total), 0)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'FULFILLED'));

    const [draftPo] = await db
      .select({ count: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'DRAFT'));

    return {
      totalPurchaseOrders: Number(totalPo?.count ?? 0),
      activePurchaseOrders: Number(activePo?.count ?? 0),
      draftPurchaseOrders: Number(draftPo?.count ?? 0),
      totalSuppliers: Number(totalSuppliers?.count ?? 0),
      totalGoodsReceipts: Number(totalGrn?.count ?? 0),
      fulfilledSpend: parseFloat(fulfilledSpend?.total ?? '0.00'),
    };
  }

  async getManufacturingSummary() {
    const [totalWo] = await db
      .select({ count: count() })
      .from(productionOrders);
    const [activeWo] = await db
      .select({ count: count() })
      .from(productionOrders)
      .where(sql`status IN ('RELEASED', 'MATERIAL_ALLOCATED', 'IN_PROGRESS')`);
    const [completedWo] = await db
      .select({ count: count() })
      .from(productionOrders)
      .where(eq(productionOrders.status, 'COMPLETED'));

    const [totalBom] = await db
      .select({ count: count() })
      .from(billOfMaterials);
    const [activeBom] = await db
      .select({ count: count() })
      .from(billOfMaterials)
      .where(eq(billOfMaterials.status, 'RELEASED'));

    const [totals] = await db
      .select({
        output: sql<string>`COALESCE(SUM(quantity_completed), 0)`,
        scrap: sql<string>`COALESCE(SUM(quantity_scrapped), 0)`,
      })
      .from(productionOrders);

    return {
      totalWorkOrders: Number(totalWo?.count ?? 0),
      activeWorkOrders: Number(activeWo?.count ?? 0),
      completedWorkOrders: Number(completedWo?.count ?? 0),
      totalBoms: Number(totalBom?.count ?? 0),
      activeBoms: Number(activeBom?.count ?? 0),
      totalProductionOutput: parseFloat(totals?.output ?? '0'),
      totalScrapQuantity: parseFloat(totals?.scrap ?? '0'),
    };
  }

  async getProjectSummary() {
    const [totalProj] = await db.select({ count: count() }).from(projects);
    const [activeProj] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.status, 'ACTIVE'));
    const [completedProj] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.status, 'COMPLETED'));

    const [matTotals] = await db
      .select({
        allocated: sql<string>`COALESCE(SUM(allocated_quantity), 0)`,
        issued: sql<string>`COALESCE(SUM(issued_quantity), 0)`,
        returned: sql<string>`COALESCE(SUM(returned_quantity), 0)`,
      })
      .from(projectMaterials);

    return {
      totalProjects: Number(totalProj?.count ?? 0),
      activeProjects: Number(activeProj?.count ?? 0),
      completedProjects: Number(completedProj?.count ?? 0),
      totalAllocatedMaterials: parseFloat(matTotals?.allocated ?? '0'),
      totalIssuedMaterials: parseFloat(matTotals?.issued ?? '0'),
      totalReturnedMaterials: parseFloat(matTotals?.returned ?? '0'),
    };
  }

  async getTransactionSummary() {
    const [totalTx] = await db
      .select({ count: count() })
      .from(inventoryTransactions);

    const [receipts] = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, 'Receipt'));

    const [issues] = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, 'Issue'));

    const [transfers] = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, 'Transfer'));

    const [adjustments] = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, 'Adjustment'));

    return {
      totalTransactions: Number(totalTx?.count ?? 0),
      receiptCount: Number(receipts?.count ?? 0),
      issueCount: Number(issues?.count ?? 0),
      transferCount: Number(transfers?.count ?? 0),
      adjustmentCount: Number(adjustments?.count ?? 0),
    };
  }
}
