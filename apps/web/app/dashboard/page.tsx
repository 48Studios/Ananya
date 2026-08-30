"use client";

import React from "react";
import Link from "next/link";
import {
  Boxes,
  ShoppingCart,
  Factory,
  Layers,
  SlidersHorizontal,
  RefreshCw,
  Clock,
  ExternalLink,
  Activity,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { WidgetPicker } from "@/components/ui/widget-picker";
import { DashboardGrid } from "@/components/ui/dashboard-grid";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChartWidget } from "@/components/charts/bar-chart-widget";
import { DonutChartWidget } from "@/components/charts/donut-chart-widget";
import { DashboardAttentionQueue } from "@/components/dashboard/dashboard-attention-queue";
import { DashboardQuickActionsCard } from "@/components/dashboard/dashboard-quick-actions-card";
import { DashboardOperationsPipeline } from "@/components/dashboard/dashboard-operations-pipeline";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  preferencesApi,
  DashboardWidgetConfig,
  FavoriteDto,
} from "@/lib/api/preferences-api";
import {
  reportingApi,
  InventorySummaryDto,
  ProcurementSummaryDto,
  ManufacturingSummaryDto,
  TransactionSummaryDto,
} from "@/lib/api/reporting-api";
import { purchaseOrdersApi, PurchaseOrderDto } from "@/lib/api/purchase-orders-api";
import { workOrdersApi, WorkOrderDto } from "@/lib/api/work-orders-api";
import { stockAdjustmentsApi, StockAdjustmentDto } from "@/lib/api/stock-adjustments-api";
import { notificationsApi, NotificationDto } from "@/lib/api/notifications-api";
import { activityApi, ActivityEventDto } from "@/lib/api/activity-api";
import { formatNumber, formatQuantity, formatCurrency } from "@/lib/utils";

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  {
    id: "attention-queue",
    title: "Operational Attention Queue",
    enabled: true,
    width: "full",
  },
  {
    id: "stats-summary",
    title: "Key Operational Metrics",
    enabled: true,
    width: "full",
  },
  {
    id: "health-charts",
    title: "Inventory & Operational Health",
    enabled: true,
    width: "full",
  },
  {
    id: "quick-actions",
    title: "Operational Quick Actions",
    enabled: true,
    width: "full",
  },
  {
    id: "recent-activity",
    title: "Real-Time Activity Stream",
    enabled: true,
    width: "half",
  },
  {
    id: "operations-pipeline",
    title: "Operations Execution Pipeline",
    enabled: true,
    width: "half",
  },
  {
    id: "favorite-records",
    title: "Pinned & Favorites",
    enabled: true,
    width: "full",
  },
];

export default function DashboardPage() {
  const [widgets, setWidgets] = React.useState<DashboardWidgetConfig[]>(DEFAULT_WIDGETS);
  const [favorites, setFavorites] = React.useState<FavoriteDto[]>([]);
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);

  // Live domain state
  const [inventorySummary, setInventorySummary] = React.useState<InventorySummaryDto | null>(null);
  const [procurementSummary, setProcurementSummary] = React.useState<ProcurementSummaryDto | null>(null);
  const [manufacturingSummary, setManufacturingSummary] = React.useState<ManufacturingSummaryDto | null>(null);
  const [transactionSummary, setTransactionSummary] = React.useState<TransactionSummaryDto | null>(null);

  const [openPurchaseOrders, setOpenPurchaseOrders] = React.useState<PurchaseOrderDto[]>([]);
  const [activeWorkOrders, setActiveWorkOrders] = React.useState<WorkOrderDto[]>([]);
  const [pendingAdjustments, setPendingAdjustments] = React.useState<StockAdjustmentDto[]>([]);
  const [notifications, setNotifications] = React.useState<NotificationDto[]>([]);
  const [recentActivities, setRecentActivities] = React.useState<ActivityEventDto[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | null>(null);

  const loadData = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [
        layoutRes,
        favRes,
        invSummaryRes,
        procSummaryRes,
        mfgSummaryRes,
        txSummaryRes,
        poRes,
        woRes,
        adjRes,
        notifRes,
        activityRes,
      ] = await Promise.allSettled([
        preferencesApi.getDashboardLayout(),
        preferencesApi.getFavorites(),
        reportingApi.getInventorySummary(),
        reportingApi.getProcurementSummary(),
        reportingApi.getManufacturingSummary(),
        reportingApi.getTransactionSummary(),
        purchaseOrdersApi.getAll(),
        workOrdersApi.getAll(),
        stockAdjustmentsApi.getAll({ status: "PENDING" }),
        notificationsApi.getUserNotifications(),
        activityApi.getFeed({ limit: 8 }),
      ]);

      // Layout preference
      if (layoutRes.status === "fulfilled" && layoutRes.value?.widgetsJson?.length) {
        setWidgets(layoutRes.value.widgetsJson);
      }

      // Favorites
      if (favRes.status === "fulfilled") {
        setFavorites(favRes.value || []);
      }

      // Domain metrics
      if (invSummaryRes.status === "fulfilled") {
        setInventorySummary(invSummaryRes.value);
      }
      if (procSummaryRes.status === "fulfilled") {
        setProcurementSummary(procSummaryRes.value);
      }
      if (mfgSummaryRes.status === "fulfilled") {
        setManufacturingSummary(mfgSummaryRes.value);
      }
      if (txSummaryRes.status === "fulfilled") {
        setTransactionSummary(txSummaryRes.value);
      }

      // Operational queues
      if (poRes.status === "fulfilled") {
        setOpenPurchaseOrders(poRes.value || []);
      }
      if (woRes.status === "fulfilled") {
        setActiveWorkOrders(woRes.value || []);
      }
      if (adjRes.status === "fulfilled") {
        setPendingAdjustments(adjRes.value || []);
      }
      if (notifRes.status === "fulfilled") {
        setNotifications(notifRes.value || []);
      }
      if (activityRes.status === "fulfilled") {
        setRecentActivities(activityRes.value || []);
      }

      setLastSyncTime(new Date());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load operational dashboard data.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleWidget = async (id: string, enabled: boolean) => {
    const updated = widgets.map((w) => (w.id === id ? { ...w, enabled } : w));
    setWidgets(updated);
    try {
      await preferencesApi.updateDashboardLayout(updated);
    } catch {
      // Ignore preference save error
    }
  };

  const handleRestoreDefaults = async () => {
    setWidgets(DEFAULT_WIDGETS);
    try {
      await preferencesApi.updateDashboardLayout(DEFAULT_WIDGETS);
    } catch {
      // Ignore preference save error
    }
  };

  if (loading) {
    return <LoadingState message="Aggregating real-time operations dashboard..." />;
  }

  if (error && !inventorySummary) {
    return (
      <ErrorState
        title="Operations Dashboard Error"
        message={error}
        onRetry={() => loadData(false)}
      />
    );
  }

  // 1. Attention Queue Widget
  const attentionQueueWidget = (
    <DashboardAttentionQueue
      purchaseOrders={openPurchaseOrders}
      workOrders={activeWorkOrders}
      adjustments={pendingAdjustments}
      notifications={notifications}
      loading={refreshing}
    />
  );

  // 2. High-Value Operational Summary (KPI Cards)
  const statsWidget = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Catalog Items"
        value={formatNumber(inventorySummary?.totalComponents)}
        subtitle={`${formatNumber(inventorySummary?.activeComponents)} active components in storage`}
        icon={Boxes}
      />
      <StatCard
        title="Committed Stock"
        value={formatQuantity(inventorySummary?.reservedQuantity, "units")}
        subtitle="Reserved for work orders & projects"
        icon={Layers}
      />
      <StatCard
        title="Procurement Activity"
        value={formatNumber(procurementSummary?.totalPurchaseOrders)}
        subtitle={`${formatNumber(procurementSummary?.activePurchaseOrders)} open orders • ${formatCurrency(
          procurementSummary?.pendingProcurementSpend || 0,
        )} pending`}
        icon={ShoppingCart}
      />
      <StatCard
        title="Production Queue"
        value={formatNumber(manufacturingSummary?.activeWorkOrders)}
        subtitle={`${formatNumber(manufacturingSummary?.totalWorkOrders)} total orders (${formatNumber(
          manufacturingSummary?.activeBoms,
        )} active BOMs)`}
        icon={Factory}
      />
    </div>
  );

  // 3. Operational Health & Distribution Charts
  const movementChartData = [
    { name: "Receipts", value: transactionSummary?.receiptCount ?? 0 },
    { name: "Issues", value: transactionSummary?.issueCount ?? 0 },
    { name: "Transfers", value: transactionSummary?.transferCount ?? 0 },
    { name: "Adjustments", value: transactionSummary?.adjustmentCount ?? 0 },
  ];

  const statusDonutData = [
    {
      name: "Active Items",
      value: inventorySummary?.activeComponents ?? 0,
      color: "#10b981",
    },
    {
      name: "Inactive Items",
      value: Math.max(
        0,
        (inventorySummary?.totalComponents ?? 0) -
          (inventorySummary?.activeComponents ?? 0),
      ),
      color: "#64748b",
    },
  ];

  const healthChartsWidget = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
        <ChartCard
          title="Stock Ledger Movements"
          subtitle="Immutable transaction audit counts across warehouse operations"
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
          title="Catalog Status Ratio"
          subtitle="Active vs inactive component records"
        >
          <DonutChartWidget data={statusDonutData} height={220} />
        </ChartCard>
      </div>
    </div>
  );

  // 4. Quick Actions Widget
  const quickActionsWidget = <DashboardQuickActionsCard />;

  // 5. Recent Activity Feed Widget
  const recentActivityWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Recent Operational Activity
          </h3>
        </div>
        <Link href="/activity">
          <Button variant="ghost" size="xs" className="h-7 text-xs text-muted-foreground gap-1">
            View All
            <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {recentActivities.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          No recent operational activity recorded in the audit log.
        </p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
          {recentActivities.map((act) => (
            <div
              key={act.id}
              className="p-3 flex items-start justify-between gap-3 text-xs hover:bg-muted/20 transition-colors"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground truncate">
                    {act.entityTitle || act.eventType}
                  </span>
                  <StatusBadge status={act.status} className="text-[10px] py-0 px-1.5" />
                  <span className="font-mono text-[10px] text-muted-foreground uppercase bg-muted/50 px-1.5 py-0.2 rounded">
                    {act.module}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-1">
                  {act.description}
                </p>
                {act.userName && (
                  <p className="text-[10px] text-muted-foreground">
                    By {act.userName}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(act.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {act.href && (
                  <Link
                    href={act.href}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    View
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // 6. Operations Pipeline Widget (Production & Inbound Shipments)
  const operationsPipelineWidget = (
    <DashboardOperationsPipeline
      workOrders={activeWorkOrders}
      purchaseOrders={openPurchaseOrders}
      loading={refreshing}
    />
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Operations Control Center"
        description="Real-time operational command center and synchronized metrics across inventory, procurement, and manufacturing."
        actions={
          <div className="flex items-center gap-2">
            {lastSyncTime && (
              <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline-block mr-1">
                Synced at{" "}
                {lastSyncTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-primary" : ""}`}
              />
              Refresh
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPickerOpen(true)}
              className="gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              Customize
            </Button>
          </div>
        }
      />

      {/* Reactive Operational Dashboard Grid */}
      <DashboardGrid
        widgets={widgets}
        attentionQueueWidget={attentionQueueWidget}
        statsWidget={statsWidget}
        healthChartsWidget={healthChartsWidget}
        quickActionsWidget={quickActionsWidget}
        recentActivityWidget={recentActivityWidget}
        operationsPipelineWidget={operationsPipelineWidget}
        favorites={favorites}
        onFavoriteRemoved={() => loadData(false)}
      />

      {/* Widget Picker Modal */}
      <WidgetPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        widgets={widgets}
        onToggleWidget={handleToggleWidget}
        onRestoreDefaults={handleRestoreDefaults}
      />
    </div>
  );
}
