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
  inventoryReservationLines,
  stockAdjustments,
  warehouseTransfers,
  accounts,
  receivableInvoices,
  payableInvoices,
  payments,
  bankReconciliations,
} from '@ananya/database/schema';
import { and, count, eq, gte, inArray, sql } from '@ananya/database/query';

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
        total: sql<string>`COALESCE(SUM(${inventoryReservationLines.reservedQuantity}), 0)`,
      })
      .from(inventoryReservationLines)
      .innerJoin(
        inventoryReservations,
        eq(inventoryReservationLines.reservationId, inventoryReservations.id),
      )
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
    const [poCount] = await db.select({ count: count() }).from(purchaseOrders);
    const [supplierCount] = await db.select({ count: count() }).from(suppliers);
    const [receiptCount] = await db
      .select({ count: count() })
      .from(goodsReceipts);

    const [draftPoCount] = await db
      .select({ count: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'DRAFT'));

    const [activePoCount] = await db
      .select({ count: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'ISSUED'));

    const [totalSpend] = await db
      .select({ total: sql<string>`COALESCE(SUM(grand_total), 0)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'FULFILLED'));

    const [pendingSpend] = await db
      .select({ total: sql<string>`COALESCE(SUM(grand_total), 0)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'ISSUED'));

    const fulfilledSpendVal = parseFloat(totalSpend?.total ?? '0.00');

    return {
      totalPurchaseOrders: Number(poCount?.count ?? 0),
      activePurchaseOrders: Number(activePoCount?.count ?? 0),
      draftPurchaseOrders: Number(draftPoCount?.count ?? 0),
      totalSuppliers: Number(supplierCount?.count ?? 0),
      totalGoodsReceipts: Number(receiptCount?.count ?? 0),
      fulfilledSpend: fulfilledSpendVal,
      totalProcurementSpend: fulfilledSpendVal,
      pendingProcurementSpend: parseFloat(pendingSpend?.total ?? '0.00'),
    };
  }

  async getManufacturingSummary() {
    const [woCount] = await db
      .select({ count: count() })
      .from(productionOrders);
    const [activeWo] = await db
      .select({ count: count() })
      .from(productionOrders)
      .where(eq(productionOrders.status, 'IN_PROGRESS'));
    const [completedWo] = await db
      .select({ count: count() })
      .from(productionOrders)
      .where(eq(productionOrders.status, 'COMPLETED'));

    const [bomCount] = await db
      .select({ count: count() })
      .from(billOfMaterials);
    const [activeBoms] = await db
      .select({ count: count() })
      .from(billOfMaterials)
      .where(eq(billOfMaterials.status, 'RELEASED'));

    const [outputTotals] = await db
      .select({
        output: sql<string>`COALESCE(SUM(quantity_completed), 0)`,
        scrap: sql<string>`COALESCE(SUM(quantity_scrapped), 0)`,
      })
      .from(productionOrders);

    return {
      totalWorkOrders: Number(woCount?.count ?? 0),
      activeWorkOrders: Number(activeWo?.count ?? 0),
      completedWorkOrders: Number(completedWo?.count ?? 0),
      totalBoms: Number(bomCount?.count ?? 0),
      activeBoms: Number(activeBoms?.count ?? 0),
      totalProductionOutput: parseFloat(outputTotals?.output ?? '0'),
      totalScrapQuantity: parseFloat(outputTotals?.scrap ?? '0'),
    };
  }

  async getProjectSummary() {
    const [projCount] = await db.select({ count: count() }).from(projects);
    const [activeProj] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.status, 'ACTIVE'));
    const [completedProj] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.status, 'COMPLETED'));
    const [materialTotals] = await db
      .select({
        allocated: sql<string>`COALESCE(SUM(${projectMaterials.allocatedQuantity}), 0)`,
        issued: sql<string>`COALESCE(SUM(${projectMaterials.issuedQuantity}), 0)`,
        returned: sql<string>`COALESCE(SUM(${projectMaterials.returnedQuantity}), 0)`,
      })
      .from(projectMaterials);

    return {
      totalProjects: Number(projCount?.count ?? 0),
      activeProjects: Number(activeProj?.count ?? 0),
      completedProjects: Number(completedProj?.count ?? 0),
      totalAllocatedMaterials: parseFloat(materialTotals?.allocated ?? '0'),
      totalIssuedMaterials: parseFloat(materialTotals?.issued ?? '0'),
      totalReturnedMaterials: parseFloat(materialTotals?.returned ?? '0'),
    };
  }

  async getTransactionSummary() {
    const [txCount] = await db
      .select({ count: count() })
      .from(inventoryTransactions);
    const [receipts] = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, 'RECEIPT'));
    const [issues] = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, 'ISSUE'));
    const [adjCount] = await db
      .select({ count: count() })
      .from(stockAdjustments);
    const [transferCount] = await db
      .select({ count: count() })
      .from(warehouseTransfers);

    return {
      totalTransactions: Number(txCount?.count ?? 0),
      receiptCount: Number(receipts?.count ?? 0),
      issueCount: Number(issues?.count ?? 0),
      transferCount: Number(transferCount?.count ?? 0),
      adjustmentCount: Number(adjCount?.count ?? 0),
    };
  }

  async getFinancialSummary() {
    const [accountCount] = await db.select({ count: count() }).from(accounts);
    const [activeAccountCount] = await db
      .select({ count: count() })
      .from(accounts)
      .where(eq(accounts.isActive, true));
    const [bankAccountCount] = await db
      .select({
        count: sql<string>`COUNT(DISTINCT ${bankReconciliations.bankAccountId})`,
      })
      .from(bankReconciliations);
    const [receivableTotals] = await db
      .select({
        outstanding: sql<string>`COALESCE(SUM(${receivableInvoices.balance}), 0)`,
      })
      .from(receivableInvoices)
      .where(
        inArray(receivableInvoices.status, [
          'POSTED',
          'PARTIALLY_PAID',
        ] as const),
      );
    const [payableTotals] = await db
      .select({
        outstanding: sql<string>`COALESCE(SUM(${payableInvoices.balance}), 0)`,
      })
      .from(payableInvoices)
      .where(
        inArray(payableInvoices.status, ['POSTED', 'PARTIALLY_PAID'] as const),
      );
    const [paymentTotals] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.status, 'POSTED'));
    const [openReconciliations] = await db
      .select({ count: count() })
      .from(bankReconciliations)
      .where(eq(bankReconciliations.status, 'IN_PROGRESS'));
    const accountTypeDistribution = await db
      .select({
        accountType: accounts.accountType,
        totalAccounts: count(),
        activeAccounts: sql<number>`COUNT(*) FILTER (WHERE ${accounts.isActive} = true)`,
      })
      .from(accounts)
      .groupBy(accounts.accountType);

    return {
      totalAccounts: Number(accountCount?.count ?? 0),
      activeAccounts: Number(activeAccountCount?.count ?? 0),
      bankAccountsWithStatements: Number(bankAccountCount?.count ?? 0),
      receivablesOutstanding: parseFloat(receivableTotals?.outstanding ?? '0'),
      payablesOutstanding: parseFloat(payableTotals?.outstanding ?? '0'),
      postedPaymentsTotal: parseFloat(paymentTotals?.total ?? '0'),
      openReconciliations: Number(openReconciliations?.count ?? 0),
      accountTypeDistribution: accountTypeDistribution.map((item) => ({
        accountType: item.accountType,
        totalAccounts: Number(item.totalAccounts ?? 0),
        activeAccounts: Number(item.activeAccounts ?? 0),
      })),
    };
  }

  async getCashFlowForecast() {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const receivableRows = await db
      .select({
        dueDate: receivableInvoices.dueDate,
        balance: receivableInvoices.balance,
      })
      .from(receivableInvoices)
      .where(
        and(
          gte(receivableInvoices.dueDate, monthStart),
          inArray(receivableInvoices.status, [
            'POSTED',
            'PARTIALLY_PAID',
          ] as const),
        ),
      );

    const payableRows = await db
      .select({
        dueDate: payableInvoices.dueDate,
        balance: payableInvoices.balance,
      })
      .from(payableInvoices)
      .where(
        and(
          gte(payableInvoices.dueDate, monthStart),
          inArray(payableInvoices.status, [
            'POSTED',
            'PARTIALLY_PAID',
          ] as const),
        ),
      );

    const reconciliationRows = await db
      .select({
        bankAccountId: bankReconciliations.bankAccountId,
        closingBalance: bankReconciliations.closingBalance,
        statementDate: bankReconciliations.statementDate,
      })
      .from(bankReconciliations)
      .orderBy(sql`${bankReconciliations.statementDate} DESC`);

    const latestBalanceByAccount = new Map<string, number>();
    for (const row of reconciliationRows) {
      if (!latestBalanceByAccount.has(row.bankAccountId)) {
        latestBalanceByAccount.set(
          row.bankAccountId,
          parseFloat(row.closingBalance ?? '0'),
        );
      }
    }

    const currentLiquidity =
      latestBalanceByAccount.size > 0
        ? Array.from(latestBalanceByAccount.values()).reduce(
            (sum, balance) => sum + balance,
            0,
          )
        : null;

    const periodMap = new Map<
      string,
      {
        id: string;
        periodStart: string;
        periodLabel: string;
        projectedInflow: number;
        projectedOutflow: number;
        receivableInvoices: number;
        payableInvoices: number;
      }
    >();

    const getPeriodKey = (value: Date) =>
      `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;

    const ensurePeriod = (date: Date) => {
      const key = getPeriodKey(date);
      if (!periodMap.has(key)) {
        const periodStartDate = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
        );
        periodMap.set(key, {
          id: key,
          periodStart: periodStartDate.toISOString(),
          periodLabel: periodStartDate.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          projectedInflow: 0,
          projectedOutflow: 0,
          receivableInvoices: 0,
          payableInvoices: 0,
        });
      }

      return periodMap.get(key)!;
    };

    for (const row of receivableRows) {
      const period = ensurePeriod(row.dueDate);
      period.projectedInflow += parseFloat(row.balance ?? '0');
      period.receivableInvoices += 1;
    }

    for (const row of payableRows) {
      const period = ensurePeriod(row.dueDate);
      period.projectedOutflow += parseFloat(row.balance ?? '0');
      period.payableInvoices += 1;
    }

    const periods = Array.from(periodMap.values())
      .sort((left, right) => left.periodStart.localeCompare(right.periodStart))
      .slice(0, 6)
      .map((period, index, allPeriods) => {
        const netCashFlow = period.projectedInflow - period.projectedOutflow;
        const cumulativeNet = allPeriods
          .slice(0, index + 1)
          .reduce(
            (sum, current) =>
              sum + (current.projectedInflow - current.projectedOutflow),
            0,
          );

        return {
          ...period,
          projectedInflow: Math.round(period.projectedInflow * 100) / 100,
          projectedOutflow: Math.round(period.projectedOutflow * 100) / 100,
          netCashFlow: Math.round(netCashFlow * 100) / 100,
          endingLiquidityReserve:
            currentLiquidity === null
              ? null
              : Math.round((currentLiquidity + cumulativeNet) * 100) / 100,
        };
      });

    return {
      currentLiquidity,
      totalProjectedInflow: periods.reduce(
        (sum, period) => sum + period.projectedInflow,
        0,
      ),
      totalProjectedOutflow: periods.reduce(
        (sum, period) => sum + period.projectedOutflow,
        0,
      ),
      periods,
      insufficientDataReason:
        periods.length === 0
          ? 'No posted receivable or payable balances exist with future due dates.'
          : null,
    };
  }
}
