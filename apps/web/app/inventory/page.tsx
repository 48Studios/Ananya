"use client";

import * as React from "react";
import Link from "next/link";
import {
  Package,
  AlertTriangle,
  AlertOctagon,
  ArrowRightLeft,
  ArrowDownLeft,
  Wrench,
  MapPin,
  RefreshCw,
  Plus,
  ExternalLink,
  ChevronRight,
  Clock,
  Layers,
  BarChart3,
  QrCode,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChartWidget } from "@/components/charts/bar-chart-widget";
import { DonutChartWidget } from "@/components/charts/donut-chart-widget";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  reportingApi,
  type InventorySummaryDto,
  type TransactionSummaryDto,
} from "@/lib/api/reporting-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
} from "@/lib/api/inventory-transactions-api";
import {
  inventoryAlertsApi,
  type InventoryAlertDto,
  type InventoryAlertSummaryDto,
} from "@/lib/api/inventory-alerts-api";
import { formatNumber, formatQuantity, formatDate } from "@/lib/utils";

export default function InventoryDashboardPage() {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [transactions, setTransactions] = React.useState<InventoryTransactionDto[]>([]);
  const [stockMap, setStockMap] = React.useState<Record<string, number>>({});
  const [inventorySummary, setInventorySummary] = React.useState<InventorySummaryDto | null>(null);
  const [transactionSummary, setTransactionSummary] = React.useState<TransactionSummaryDto | null>(null);
  const [activeAlerts, setActiveAlerts] = React.useState<InventoryAlertDto[]>([]);
  const [alertSummary, setAlertSummary] = React.useState<InventoryAlertSummaryDto | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [
        compsRes,
        catsRes,
        locsRes,
        txsRes,
        invSummaryRes,
        txSummaryRes,
        alertsRes,
        alertSummaryRes,
      ] = await Promise.allSettled([
        componentsApi.getAll(),
        categoriesApi.getAll(),
        locationsApi.getAll(),
        inventoryTransactionsApi.getAll(),
        reportingApi.getInventorySummary(),
        reportingApi.getTransactionSummary(),
        inventoryAlertsApi.listAlerts({ status: "ACTIVE", limit: 20 }),
        inventoryAlertsApi.getSummary(),
      ]);

      const comps = compsRes.status === "fulfilled" ? compsRes.value : [];
      const cats = catsRes.status === "fulfilled" ? catsRes.value : [];
      const locs = locsRes.status === "fulfilled" ? locsRes.value : [];
      const txs = txsRes.status === "fulfilled" ? txsRes.value : [];

      setComponents(comps);
      setCategories(cats);
      setLocations(locs);
      setTransactions(txs);

      if (invSummaryRes.status === "fulfilled") {
        setInventorySummary(invSummaryRes.value);
      }
      if (txSummaryRes.status === "fulfilled") {
        setTransactionSummary(txSummaryRes.value);
      }
      if (alertsRes.status === "fulfilled") {
        setActiveAlerts(alertsRes.value || []);
      }
      if (alertSummaryRes.status === "fulfilled") {
        setAlertSummary(alertSummaryRes.value);
      }

      // Compute on-hand stock map from transactions
      const computedStock: Record<string, number> = {};
      for (const tx of txs) {
        const qty = Number(tx.quantity) || 0;
        const current = computedStock[tx.componentId] ?? 0;
        if (
          ["Receipt", "Return", "Production", "InitialStock"].includes(
            tx.transactionType,
          )
        ) {
          computedStock[tx.componentId] = current + qty;
        } else if (["Issue", "Consumption"].includes(tx.transactionType)) {
          computedStock[tx.componentId] = current - qty;
        } else if (tx.transactionType === "Adjustment") {
          computedStock[tx.componentId] = current + qty;
        }
      }
      setStockMap(computedStock);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load inventory dashboard data.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lookup maps
  const componentLookup = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const categoryLookup = React.useMemo(() => {
    const map = new Map<string, CategoryDto>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const locationLookup = React.useMemo(() => {
    const map = new Map<string, LocationDto>();
    for (const l of locations) map.set(l.id, l);
    return map;
  }, [locations]);

  // Derived metrics
  const activeComponentsCount = React.useMemo(
    () => inventorySummary?.activeComponents ?? components.filter((c) => c.isActive).length,
    [inventorySummary, components],
  );

  const totalStockUnits = React.useMemo(
    () => Object.values(stockMap).reduce((acc, qty) => acc + qty, 0),
    [stockMap],
  );

  const outOfStockComponents = React.useMemo(() => {
    return components.filter((c) => (stockMap[c.id] || 0) <= 0);
  }, [components, stockMap]);

  const lowStockComponents = React.useMemo(() => {
    return components.filter((c) => {
      const stock = stockMap[c.id] || 0;
      return stock > 0 && stock <= 10;
    });
  }, [components, stockMap]);

  const outOfStockCount = alertSummary?.outOfStock ?? outOfStockComponents.length;
  const lowStockCount = alertSummary?.lowStock ?? lowStockComponents.length;

  // Chart data: Stock movement ledger
  const movementChartData = React.useMemo(() => {
    return [
      { name: "Receipts", value: transactionSummary?.receiptCount ?? 0 },
      { name: "Issues", value: transactionSummary?.issueCount ?? 0 },
      { name: "Transfers", value: transactionSummary?.transferCount ?? 0 },
      { name: "Adjustments", value: transactionSummary?.adjustmentCount ?? 0 },
    ];
  }, [transactionSummary]);

  // Chart data: Category distribution (Top 5 categories + Others)
  const categoryChartData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of components) {
      const catId = c.categoryId || "uncategorized";
      counts[catId] = (counts[catId] || 0) + 1;
    }
    const colors = ["#1E90FF", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];
    const entries = Object.entries(counts).map(([catId, val]) => {
      const catName = catId === "uncategorized" ? "Unassigned" : categoryLookup.get(catId)?.name || "Unknown";
      return { name: catName, value: val };
    });
    entries.sort((a, b) => b.value - a.value);
    const top = entries.slice(0, 5);
    const remainder = entries.slice(5).reduce((acc, curr) => acc + curr.value, 0);
    if (remainder > 0) {
      top.push({ name: "Others", value: remainder });
    }
    return top.map((entry, idx) => ({
      ...entry,
      color: colors[idx % colors.length],
    }));
  }, [components, categoryLookup]);

  // Recent Stock Activity (Top 6 most recent transactions)
  const recentMovements = React.useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [transactions]);

  if (loading) {
    return <LoadingState message="Aggregating operational inventory dashboard..." />;
  }

  if (error && components.length === 0) {
    return (
      <ErrorState
        title="Inventory Dashboard Error"
        message={error}
        onRetry={() => fetchData(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Inventory Dashboard"
        description="Operational snapshot of catalog items, stock balances, active alerts, and ledger movements."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-primary" : ""}`}
              />
              Refresh
            </Button>
            <Link href="/inventory/transactions">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
                Ledger Movements
              </Button>
            </Link>
            <Link href="/inventory/components">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Manage Catalog
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. KPI Summary Row with Drill-Down Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/inventory/components" className="group block focus:outline-hidden">
          <StatCard
            title="Total Catalog Items"
            value={formatNumber(components.length)}
            subtitle={`${activeComponentsCount} active SKU records`}
            icon={Package}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>

        <Link
          href="/inventory/components?stockStatus=in_stock"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Total Stock Units"
            value={formatNumber(totalStockUnits)}
            subtitle={`${inventorySummary?.reservedQuantity ? `${formatQuantity(inventorySummary.reservedQuantity, "units")} reserved` : "In storage locations"}`}
            icon={Layers}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>

        <Link
          href="/inventory/components?stockStatus=low_stock"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Low Stock Items"
            value={formatNumber(lowStockCount)}
            subtitle="Threshold: ≤ 10 units remaining"
            icon={AlertTriangle}
            className={`transition-colors ${lowStockCount > 0 ? "border-amber-500/30 group-hover:border-amber-500" : "group-hover:border-primary/50"}`}
          />
        </Link>

        <Link
          href="/inventory/components?stockStatus=out_of_stock"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Out of Stock Items"
            value={formatNumber(outOfStockCount)}
            subtitle="Zero quantity on-hand"
            icon={AlertOctagon}
            className={`transition-colors ${outOfStockCount > 0 ? "border-destructive/30 group-hover:border-destructive" : "group-hover:border-primary/50"}`}
          />
        </Link>
      </div>

      {/* 3. Stock Alerts & Attention Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">
              Stock Replenishment & Critical Alerts
            </h3>
            {(outOfStockCount > 0 || lowStockCount > 0) && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 font-mono">
                {outOfStockCount + lowStockCount} Critical
              </span>
            )}
          </div>
          <Link href="/inventory/components?stockStatus=out_of_stock">
            <Button variant="ghost" size="xs" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
              View All Low / Out of Stock
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {outOfStockComponents.length === 0 && lowStockComponents.length === 0 && activeAlerts.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>All inventory components have sufficient stock levels. No active shortages or reorder alerts.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Show Out-of-Stock alert cards */}
            {outOfStockComponents.slice(0, 3).map((comp) => (
              <div
                key={`oos-${comp.id}`}
                className="p-3 bg-background border border-destructive/30 rounded-lg space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive truncate">
                      {comp.sku}
                    </span>
                    <span className="text-[10px] font-bold text-destructive uppercase tracking-wide">
                      Out of Stock
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground truncate" title={comp.name}>
                    {comp.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Available: 0 {comp.unit}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <Link
                    href={`/inventory/components/${comp.id}`}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    View SKU <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                  <Link href={`/procurement/purchase-orders/new`}>
                    <Button size="xs" variant="outline" className="h-6 text-[10px] gap-1">
                      Order Stock
                    </Button>
                  </Link>
                </div>
              </div>
            ))}

            {/* Show Low-Stock alert cards */}
            {lowStockComponents.slice(0, 3).map((comp) => {
              const currentQty = stockMap[comp.id] || 0;
              return (
                <div
                  key={`low-${comp.id}`}
                  className="p-3 bg-background border border-amber-500/30 rounded-lg space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 truncate">
                        {comp.sku}
                      </span>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                        Low Stock
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground truncate" title={comp.name}>
                      {comp.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Remaining: {currentQty} {comp.unit} (Threshold: 10)
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <Link
                      href={`/inventory/components/${comp.id}`}
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      View SKU <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                    <Link href={`/procurement/purchase-orders/new`}>
                      <Button size="xs" variant="outline" className="h-6 text-[10px] gap-1">
                        Reorder
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Operational Visualizations: Movements & Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Stock Movement Ledger"
            subtitle="Audited ledger transaction counts across warehouse operations"
          >
            <BarChartWidget
              data={movementChartData}
              color="#1E90FF"
              height={220}
            />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Catalog Categories Breakdown"
            subtitle="Item distribution across taxonomy groups"
          >
            <DonutChartWidget data={categoryChartData} height={220} />
          </ChartCard>
        </div>
      </div>

      {/* 5. Recent Activity & Storage Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Ledger Transactions */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Recent Stock Movements
              </h3>
            </div>
            <Link href="/inventory/transactions">
              <Button variant="ghost" size="xs" className="gap-1 text-xs text-muted-foreground">
                View All Ledger
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {recentMovements.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              No recent inventory transactions recorded.
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
              {recentMovements.map((tx) => {
                const comp = componentLookup.get(tx.componentId);
                const locId = tx.destinationLocationId || tx.sourceLocationId;
                const loc = locId ? locationLookup.get(locId) : null;
                const isReceipt = ["Receipt", "Return", "InitialStock"].includes(tx.transactionType);
                const isIssue = ["Issue", "Consumption"].includes(tx.transactionType);
                return (
                  <div
                    key={tx.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-medium text-foreground">
                          {comp?.sku || tx.componentId.slice(0, 8)}
                        </span>
                        <StatusBadge
                          status={
                            isReceipt ? "COMPLETED" : isIssue ? "SCHEDULED" : "OPEN"
                          }
                          className="text-[10px] py-0 px-1.5"
                        />
                        <span className="font-mono text-[10px] text-muted-foreground uppercase bg-muted/50 px-1.5 py-0.2 rounded">
                          {tx.transactionType}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-[11px] truncate" title={comp?.name}>
                        {comp?.name || "Inventory item"}
                        {loc ? ` • Location: ${loc.code}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${
                          isReceipt
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : isIssue
                              ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              : "bg-muted text-foreground"
                        }`}
                      >
                        {isIssue ? `-${tx.quantity}` : `+${tx.quantity}`} {comp?.unit || "units"}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(tx.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 6. Quick Operations & Warehouse Stats */}
        <div className="space-y-6">
          {/* Storage & Facilities summary */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Facilities & Storage Hierarchy
            </h3>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground block">Locations & Bays</span>
                <span className="text-lg font-bold text-foreground font-mono">{locations.length}</span>
              </div>
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground block">Categories</span>
                <span className="text-lg font-bold text-foreground font-mono">{categories.length}</span>
              </div>
            </div>
            <Link href="/inventory/locations" className="block pt-1">
              <Button variant="outline" size="xs" className="w-full text-xs gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Manage Locations & Spatial
              </Button>
            </Link>
          </div>

          {/* 7. Quick Actions Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Inventory Quick Actions
            </h3>
            <div className="space-y-2">
              <Link href="/inventory/components" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      New Catalog Component
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Register SKU or item
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/procurement/goods-receipts/new" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Receive Inbound Stock
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Goods receipt against PO
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/inventory/transactions" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <Wrench className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Stock Adjustment & Counts
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Audit ledger correction
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/inventory/warehouse-transfers" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Warehouse Transfers
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Move stock between locations
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/inventory/barcodes" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <QrCode className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Barcode Studio
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Scan hardware & print labels
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
