"use client";

import * as React from "react";
import Link from "next/link";
import {
  Factory,
  Plus,
  Wrench,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Package,
  ChevronRight,
  BadgeCheck,
  ListFilter,
  TrendingUp,
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
  type ManufacturingSummaryDto,
} from "@/lib/api/reporting-api";
import { workOrdersApi, type WorkOrderDto } from "@/lib/api/work-orders-api";
import { bomsApi, type BillOfMaterialsDto } from "@/lib/api/boms-api";
import { mrpApi, type MaterialShortageDto } from "@/lib/api/mrp-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { formatNumber, formatQuantity, formatDate } from "@/lib/utils";

export default function ManufacturingDashboardPage() {
  const [workOrders, setWorkOrders] = React.useState<WorkOrderDto[]>([]);
  const [boms, setBoms] = React.useState<BillOfMaterialsDto[]>([]);
  const [shortages, setShortages] = React.useState<MaterialShortageDto[]>([]);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [summary, setSummary] = React.useState<ManufacturingSummaryDto | null>(null);

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
      const [woRes, bomRes, shortagesRes, compsRes, summaryRes] =
        await Promise.allSettled([
          workOrdersApi.getAll(),
          bomsApi.getAll(),
          mrpApi.getShortages(),
          componentsApi.getAll(),
          reportingApi.getManufacturingSummary(),
        ]);

      if (woRes.status === "fulfilled") setWorkOrders(woRes.value || []);
      if (bomRes.status === "fulfilled") setBoms(bomRes.value || []);
      if (shortagesRes.status === "fulfilled") setShortages(shortagesRes.value || []);
      if (compsRes.status === "fulfilled") setComponents(compsRes.value || []);
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load manufacturing dashboard.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Component lookup map
  const componentsMap = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  // Derived work order metrics
  const draftOrders = React.useMemo(
    () => workOrders.filter((w) => w.status === "DRAFT"),
    [workOrders],
  );
  const releasedOrders = React.useMemo(
    () =>
      workOrders.filter(
        (w) => w.status === "RELEASED" || (w.status as string) === "MATERIAL_ALLOCATED",
      ),
    [workOrders],
  );
  const inProgressOrders = React.useMemo(
    () => workOrders.filter((w) => w.status === "IN_PROGRESS"),
    [workOrders],
  );
  const completedOrders = React.useMemo(
    () =>
      workOrders.filter(
        (w) => w.status === "COMPLETED" || (w.status as string) === "CLOSED",
      ),
    [workOrders],
  );

  const activeOrdersCount = inProgressOrders.length + releasedOrders.length;

  // Delayed orders
  const delayedOrders = React.useMemo(() => {
    const now = new Date();
    return workOrders.filter(
      (w) =>
        w.endDate &&
        new Date(w.endDate) < now &&
        w.status !== "COMPLETED" &&
        (w.status as string) !== "CLOSED" &&
        w.status !== "CANCELLED",
    );
  }, [workOrders]);

  // Active BOMs
  const activeBoms = React.useMemo(
    () => boms.filter((b) => b.status === "RELEASED"),
    [boms],
  );

  // Attention queue items
  const attentionItems = React.useMemo(() => {
    const list: Array<{
      id: string;
      orderNumber: string;
      title: string;
      reason: string;
      status: string;
      actionUrl: string;
      actionLabel: string;
      isUrgent: boolean;
    }> = [];

    // 1. Delayed production runs
    for (const wo of delayedOrders.slice(0, 3)) {
      const comp = componentsMap.get(wo.componentId);
      list.push({
        id: wo.id,
        orderNumber: wo.productionNumber,
        title: comp?.name || `Product SKU`,
        reason: `Target completion passed (${wo.quantityCompleted}/${wo.quantityPlanned} units done)`,
        status: wo.status,
        actionUrl: `/manufacturing/work-orders/${wo.id}`,
        actionLabel: "View Order",
        isUrgent: true,
      });
    }

    // 2. Material shortages from MRP
    for (const sh of shortages.slice(0, 3)) {
      list.push({
        id: `sh-${sh.id}`,
        orderNumber: sh.sku,
        title: sh.componentName,
        reason: `Shortage: ${sh.suggestedPoQuantity} units required by ${formatDate(sh.requiredByDate)}`,
        status: "SHORTAGE",
        actionUrl: `/procurement/purchase-orders/new`,
        actionLabel: "Order Stock",
        isUrgent: false,
      });
    }

    // 3. Urgent priority in-progress jobs
    for (const wo of inProgressOrders.filter((w) => w.priority === "URGENT" || w.priority === "HIGH").slice(0, 2)) {
      if (!list.some((item) => item.id === wo.id)) {
        const comp = componentsMap.get(wo.componentId);
        list.push({
          id: wo.id,
          orderNumber: wo.productionNumber,
          title: comp?.name || `Product SKU`,
          reason: `High priority shop floor execution (${wo.priority} Priority)`,
          status: wo.status,
          actionUrl: `/manufacturing/work-orders/${wo.id}`,
          actionLabel: "View Order",
          isUrgent: false,
        });
      }
    }

    return list;
  }, [delayedOrders, shortages, inProgressOrders, componentsMap]);

  // Chart data: Status breakdown donut
  const statusChartData = React.useMemo(() => {
    return [
      { name: "Draft", value: draftOrders.length, color: "#64748b" },
      { name: "Released", value: releasedOrders.length, color: "#f59e0b" },
      { name: "In Progress", value: inProgressOrders.length, color: "#1E90FF" },
      { name: "Completed", value: completedOrders.length, color: "#10b981" },
    ].filter((item) => item.value > 0);
  }, [draftOrders, releasedOrders, inProgressOrders, completedOrders]);

  // Chart data: Work Orders by Priority
  const priorityChartData = React.useMemo(() => {
    let urgent = 0;
    let high = 0;
    let normal = 0;
    let low = 0;
    for (const wo of workOrders) {
      if (wo.status !== "CANCELLED") {
        if (wo.priority === "URGENT") urgent += 1;
        else if (wo.priority === "HIGH") high += 1;
        else if (wo.priority === "NORMAL") normal += 1;
        else low += 1;
      }
    }
    return [
      { name: "Urgent", value: urgent },
      { name: "High", value: high },
      { name: "Normal", value: normal },
      { name: "Low", value: low },
    ];
  }, [workOrders]);

  // Recent 5 work orders
  const recentOrders = React.useMemo(() => {
    return [...workOrders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [workOrders]);

  if (loading) {
    return <LoadingState message="Aggregating operational manufacturing dashboard..." />;
  }

  if (error && workOrders.length === 0) {
    return (
      <ErrorState
        title="Manufacturing Dashboard Error"
        message={error}
        onRetry={() => fetchData(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Manufacturing Dashboard"
        description="Shop floor command center for work order routing, active production runs, BOM tracking, and material planning."
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
            <Link href="/manufacturing/mrp">
              <Button variant="outline" size="sm" className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-primary" />
                MRP Planning
              </Button>
            </Link>
            <Link href="/manufacturing/work-orders/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                New Work Order
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/manufacturing/work-orders?status=active"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Active Work Orders"
            value={formatNumber(activeOrdersCount)}
            subtitle={`${inProgressOrders.length} in progress • ${releasedOrders.length} released`}
            icon={Factory}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>

        <Link
          href="/manufacturing/work-orders?status=COMPLETED"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Completed Production"
            value={formatNumber(completedOrders.length)}
            subtitle={`${formatQuantity(summary?.totalProductionOutput || 0, "units")} finished goods`}
            icon={BadgeCheck}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>

        <Link
          href="/manufacturing/work-orders?status=delayed"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Delayed Production Runs"
            value={formatNumber(delayedOrders.length)}
            subtitle="Target date exceeded"
            icon={AlertTriangle}
            className={`transition-colors ${delayedOrders.length > 0 ? "border-destructive/30 group-hover:border-destructive" : "group-hover:border-primary/50"}`}
          />
        </Link>

        <Link
          href="/manufacturing/mrp/materials"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Material Shortages"
            value={formatNumber(shortages.length)}
            subtitle="MRP component requirements"
            icon={Package}
            className={`transition-colors ${shortages.length > 0 ? "border-amber-500/30 group-hover:border-amber-500" : "group-hover:border-primary/50"}`}
          />
        </Link>
      </div>

      {/* 3. Production Lifecycle Pipeline */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Manufacturing Execution Pipeline
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {workOrders.length} Total Work Orders
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {/* Stage 1: Draft */}
          <Link
            href="/manufacturing/work-orders?status=DRAFT"
            className="p-3 bg-muted/20 border border-border/80 hover:border-primary/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              1. Draft / Planning
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-primary transition-colors">
                {draftOrders.length}
              </span>
              <StatusBadge status="DRAFT" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 2: Released */}
          <Link
            href="/manufacturing/work-orders?status=RELEASED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-amber-500/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              2. Released & Staged
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-amber-600 transition-colors">
                {releasedOrders.length}
              </span>
              <StatusBadge status="PENDING" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 3: In Progress */}
          <Link
            href="/manufacturing/work-orders?status=IN_PROGRESS"
            className="p-3 bg-muted/20 border border-border/80 hover:border-blue-500/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              3. In Progress on Floor
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-blue-600 transition-colors">
                {inProgressOrders.length}
              </span>
              <StatusBadge status="IN_PROGRESS" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 4: Completed */}
          <Link
            href="/manufacturing/work-orders?status=COMPLETED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-emerald-500/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              4. Completed Output
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-emerald-600 transition-colors">
                {completedOrders.length}
              </span>
              <StatusBadge status="COMPLETED" className="text-[10px] py-0 px-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* 4. Manufacturing Attention Queue */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">
              Production Attention & Shortage Queue
            </h3>
            {attentionItems.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-mono">
                {attentionItems.length} Actions Required
              </span>
            )}
          </div>
          <Link href="/manufacturing/work-orders">
            <Button variant="ghost" size="xs" className="gap-1 text-xs text-muted-foreground">
              View All Orders
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {attentionItems.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>No delayed production orders or material shortages. Shop floor operations are running on schedule.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {attentionItems.map((item) => (
              <div
                key={`att-${item.id}`}
                className={`p-3 bg-background border rounded-lg space-y-2 flex flex-col justify-between ${
                  item.isUrgent
                    ? "border-destructive/40"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground truncate">
                      {item.orderNumber}
                    </span>
                    <StatusBadge status={item.status} className="text-[10px] py-0 px-1" />
                  </div>
                  <p className="text-xs font-medium text-foreground truncate" title={item.title}>
                    {item.title}
                  </p>
                  <p className={`text-[11px] ${item.isUrgent ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {item.reason}
                  </p>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-border/60">
                  <Link href={item.actionUrl}>
                    <Button size="xs" variant={item.isUrgent ? "default" : "outline"} className="h-6 text-[10px] gap-1">
                      {item.actionLabel}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Visualizations: Priorities & Status Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Production Orders by Priority"
            subtitle="Shop floor job distribution across urgency tiers"
          >
            <BarChartWidget
              data={priorityChartData}
              color="#1E90FF"
              height={220}
            />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Work Order Status Ratio"
            subtitle="Execution lifecycle distribution"
          >
            {statusChartData.length > 0 ? (
              <DonutChartWidget data={statusChartData} height={220} />
            ) : (
              <p className="text-xs text-muted-foreground italic py-16 text-center">
                No manufacturing orders recorded.
              </p>
            )}
          </ChartCard>
        </div>
      </div>

      {/* 6. Recent Production Activity & Secondary Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Work Orders */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Recent Manufacturing Runs
              </h3>
            </div>
            <Link href="/manufacturing/work-orders">
              <Button variant="ghost" size="xs" className="gap-1 text-xs text-muted-foreground">
                View All Work Orders
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              No work orders created.
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
              {recentOrders.map((wo) => {
                const comp = componentsMap.get(wo.componentId);
                const percentDone =
                  wo.quantityPlanned > 0
                    ? Math.round((wo.quantityCompleted / wo.quantityPlanned) * 100)
                    : 0;
                return (
                  <div
                    key={wo.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/manufacturing/work-orders/${wo.id}`}
                          className="font-mono font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {wo.productionNumber}
                        </Link>
                        <StatusBadge status={wo.status} className="text-[10px] py-0 px-1.5" />
                        <span className="font-mono text-[10px] text-muted-foreground uppercase bg-muted/50 px-1.5 py-0.2 rounded">
                          {wo.priority}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-[11px] truncate">
                        {comp?.name || `Component #${wo.componentId.slice(0, 8)}`} • Progress: {wo.quantityCompleted} / {wo.quantityPlanned} units ({percentDone}%)
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {wo.quantityPlanned} units
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(wo.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 7. Quick Operations & BOM Stats */}
        <div className="space-y-6">
          {/* Bills of Materials summary */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Bills of Materials (BOM)
            </h3>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground block">Active BOMs</span>
                <span className="text-lg font-bold text-foreground font-mono">{activeBoms.length}</span>
              </div>
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground block">Total Catalogs</span>
                <span className="text-lg font-bold text-foreground font-mono">{boms.length}</span>
              </div>
            </div>
            <Link href="/manufacturing/boms" className="block pt-1">
              <Button variant="outline" size="xs" className="w-full text-xs gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Manage Bills of Materials
              </Button>
            </Link>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Factory className="w-4 h-4 text-primary" />
              Manufacturing Quick Actions
            </h3>
            <div className="space-y-2">
              <Link href="/manufacturing/work-orders/new" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      New Work Order
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Schedule job from released BOM
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/manufacturing/boms/new" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      New Bill of Materials
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Define multi-level assembly
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/manufacturing/mrp" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Run Material Planning (MRP)
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Calculate component shortages
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/manufacturing/material-consumption" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <ListFilter className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Material Consumption
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Record batch & serial usage
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/manufacturing/finished-goods" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <BadgeCheck className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Finished Goods Receipts
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Receive production into warehouse
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
