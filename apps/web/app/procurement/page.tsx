"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  ChevronRight,
  PackageCheck,
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
  type ProcurementSummaryDto,
} from "@/lib/api/reporting-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import {
  goodsReceiptsApi,
  type GoodsReceiptDto,
} from "@/lib/api/goods-receipts-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

export default function ProcurementDashboardPage() {
  const [orders, setOrders] = React.useState<PurchaseOrderDto[]>([]);
  const [receipts, setReceipts] = React.useState<GoodsReceiptDto[]>([]);
  const [suppliers, setSuppliers] = React.useState<SupplierDto[]>([]);
  const [summary, setSummary] = React.useState<ProcurementSummaryDto | null>(null);

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
      const [ordersRes, receiptsRes, suppliersRes, summaryRes] =
        await Promise.allSettled([
          purchaseOrdersApi.getAll(),
          goodsReceiptsApi.getAll(),
          suppliersApi.getAll(),
          reportingApi.getProcurementSummary(),
        ]);

      if (ordersRes.status === "fulfilled") setOrders(ordersRes.value || []);
      if (receiptsRes.status === "fulfilled") setReceipts(receiptsRes.value || []);
      if (suppliersRes.status === "fulfilled") setSuppliers(suppliersRes.value || []);
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load procurement dashboard.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Supplier lookup
  const suppliersMap = React.useMemo(() => {
    const map = new Map<string, SupplierDto>();
    for (const s of suppliers) map.set(s.id, s);
    return map;
  }, [suppliers]);

  // Derived metrics

  const fulfilledSpend = React.useMemo(() => {
    return summary?.fulfilledSpend ??
      orders
        .filter((o) => o?.status === "FULFILLED")
        .reduce((sum, o) => sum + (o?.grandTotal || 0), 0);
  }, [summary, orders]);

  const pendingSpend = React.useMemo(() => {
    return summary?.pendingProcurementSpend ??
      orders
        .filter((o) => ["ISSUED", "PARTIALLY_RECEIVED", "APPROVED"].includes(o?.status))
        .reduce((sum, o) => sum + (o?.grandTotal || 0), 0);
  }, [summary, orders]);

  // Workflow pipeline stages counts
  const draftOrders = React.useMemo(
    () => orders.filter((o) => o?.status === "DRAFT"),
    [orders],
  );
  const submittedOrders = React.useMemo(
    () => orders.filter((o) => o?.status === "SUBMITTED"),
    [orders],
  );
  const approvedOrders = React.useMemo(
    () => orders.filter((o) => o?.status === "APPROVED"),
    [orders],
  );
  const issuedOrders = React.useMemo(
    () => orders.filter((o) => o?.status === "ISSUED"),
    [orders],
  );
  const partiallyReceivedOrders = React.useMemo(
    () => orders.filter((o) => o?.status === "PARTIALLY_RECEIVED"),
    [orders],
  );
  const fulfilledOrders = React.useMemo(
    () => orders.filter((o) => o?.status === "FULFILLED"),
    [orders],
  );

  // Overdue orders
  const overdueOrders = React.useMemo(() => {
    const now = new Date();
    return orders.filter(
      (o) =>
        o?.expectedDeliveryDate &&
        new Date(o.expectedDeliveryDate) < now &&
        o.status !== "FULFILLED" &&
        o.status !== "CANCELLED",
    );
  }, [orders]);

  // Top attention items
  const attentionItems = React.useMemo(() => {
    const list: Array<{
      id: string;
      poNumber: string;
      supplierName: string;
      reason: string;
      status: string;
      grandTotal: number;
      actionUrl: string;
      actionLabel: string;
      isUrgent: boolean;
    }> = [];

    // Overdue items
    for (const po of overdueOrders.slice(0, 3)) {
      list.push({
        id: po.id,
        poNumber: po.poNumber,
        supplierName: suppliersMap.get(po.supplierId)?.name || po.supplierId,
        reason: `Overdue (Due: ${formatDate(po.expectedDeliveryDate!)})`,
        status: po.status,
        grandTotal: po.grandTotal,
        actionUrl: `/procurement/goods-receipts/new?poId=${po.id}`,
        actionLabel: "Receive Goods",
        isUrgent: true,
      });
    }

    // Pending approvals
    for (const po of submittedOrders.slice(0, 3)) {
      list.push({
        id: po.id,
        poNumber: po.poNumber,
        supplierName: suppliersMap.get(po.supplierId)?.name || po.supplierId,
        reason: "Pending Management Approval",
        status: po.status,
        grandTotal: po.grandTotal,
        actionUrl: `/procurement/purchase-orders/${po.id}`,
        actionLabel: "Review Order",
        isUrgent: false,
      });
    }

    // Orders awaiting delivery
    for (const po of issuedOrders.slice(0, 2)) {
      list.push({
        id: po.id,
        poNumber: po.poNumber,
        supplierName: suppliersMap.get(po.supplierId)?.name || po.supplierId,
        reason: "Awaiting Inbound Shipment",
        status: po.status,
        grandTotal: po.grandTotal,
        actionUrl: `/procurement/goods-receipts/new?poId=${po.id}`,
        actionLabel: "Receive Goods",
        isUrgent: false,
      });
    }

    return list;
  }, [overdueOrders, submittedOrders, issuedOrders, suppliersMap]);

  // Chart data: Status breakdown donut
  const statusChartData = React.useMemo(() => {
    return [
      { name: "Draft", value: draftOrders.length, color: "#64748b" },
      { name: "Pending Approval", value: submittedOrders.length, color: "#f59e0b" },
      { name: "Approved", value: approvedOrders.length, color: "#1E90FF" },
      { name: "Ordered (Issued)", value: issuedOrders.length, color: "#3b82f6" },
      { name: "Partially Received", value: partiallyReceivedOrders.length, color: "#8b5cf6" },
      { name: "Fulfilled", value: fulfilledOrders.length, color: "#10b981" },
    ].filter((item) => item.value > 0);
  }, [
    draftOrders,
    submittedOrders,
    approvedOrders,
    issuedOrders,
    partiallyReceivedOrders,
    fulfilledOrders,
  ]);

  // Chart data: Spend by top suppliers
  const supplierSpendChartData = React.useMemo(() => {
    const spendBySupplier: Record<string, number> = {};
    for (const po of orders) {
      if (po.status !== "CANCELLED") {
        const supp = suppliersMap.get(po.supplierId);
        const name = supp?.name || po.supplierId.slice(0, 8);
        spendBySupplier[name] = (spendBySupplier[name] || 0) + (po.grandTotal || 0);
      }
    }
    const entries = Object.entries(spendBySupplier).map(([name, val]) => ({
      name,
      value: Math.round(val),
    }));
    entries.sort((a, b) => b.value - a.value);
    return entries.slice(0, 5);
  }, [orders, suppliersMap]);

  // Recent 5 POs
  const recentOrders = React.useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [orders]);

  if (loading) {
    return <LoadingState message="Aggregating operational procurement dashboard..." />;
  }

  if (error && orders.length === 0) {
    return (
      <ErrorState
        title="Procurement Dashboard Error"
        message={error}
        onRetry={() => fetchData(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Procurement Dashboard"
        description="Command center for purchase orders, supplier fulfillment, goods receipts, and purchasing spend."
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
            <Link href="/procurement/goods-receipts/new">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-primary" />
                Receive Goods
              </Button>
            </Link>
            <Link href="/procurement/purchase-orders/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                New Purchase Order
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/procurement/purchase-orders" className="group block focus:outline-hidden">
          <StatCard
            title="Total Purchase Orders"
            value={formatNumber(orders.length)}
            subtitle={`${fulfilledOrders.length} fulfilled • ${draftOrders.length} drafts`}
            icon={ShoppingCart}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>

        <Link
          href="/procurement/purchase-orders?status=SUBMITTED"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Pending Approvals"
            value={formatNumber(submittedOrders.length)}
            subtitle="Requires manager sign-off"
            icon={Clock}
            className={`transition-colors ${submittedOrders.length > 0 ? "border-amber-500/30 group-hover:border-amber-500" : "group-hover:border-primary/50"}`}
          />
        </Link>

        <Link
          href="/procurement/purchase-orders?status=ISSUED"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Orders Awaiting Receipt"
            value={formatNumber(issuedOrders.length + partiallyReceivedOrders.length)}
            subtitle={`${partiallyReceivedOrders.length} partially received`}
            icon={PackageCheck}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>

        <Link
          href="/procurement/purchase-orders?status=overdue"
          className="group block focus:outline-hidden"
        >
          <StatCard
            title="Outstanding Spend"
            value={formatCurrency(pendingSpend)}
            subtitle={`Fulfilled: ${formatCurrency(fulfilledSpend)}`}
            icon={DollarSign}
            className="group-hover:border-primary/50 transition-colors"
          />
        </Link>
      </div>

      {/* 3. Procurement Workflow Pipeline Visualizer */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Procurement Lifecycle Pipeline
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {orders.length} Total Orders Tracked
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          {/* Stage 1: Draft */}
          <Link
            href="/procurement/purchase-orders?status=DRAFT"
            className="p-3 bg-muted/20 border border-border/80 hover:border-primary/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              1. Draft / Request
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-primary transition-colors">
                {draftOrders.length}
              </span>
              <StatusBadge status="DRAFT" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 2: Submitted */}
          <Link
            href="/procurement/purchase-orders?status=SUBMITTED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-amber-500/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              2. Approval Req.
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-amber-600 transition-colors">
                {submittedOrders.length}
              </span>
              <StatusBadge status="PENDING" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 3: Approved */}
          <Link
            href="/procurement/purchase-orders?status=APPROVED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-primary/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              3. Approved
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-primary transition-colors">
                {approvedOrders.length}
              </span>
              <StatusBadge status="APPROVED" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 4: Issued */}
          <Link
            href="/procurement/purchase-orders?status=ISSUED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-primary/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              4. Inbound / Issued
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-primary transition-colors">
                {issuedOrders.length}
              </span>
              <StatusBadge status="ISSUED" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 5: Partially Received */}
          <Link
            href="/procurement/purchase-orders?status=PARTIALLY_RECEIVED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-primary/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              5. Partial Receipt
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-primary transition-colors">
                {partiallyReceivedOrders.length}
              </span>
              <StatusBadge status="IN_PROGRESS" className="text-[10px] py-0 px-1" />
            </div>
          </Link>

          {/* Stage 6: Fulfilled */}
          <Link
            href="/procurement/purchase-orders?status=FULFILLED"
            className="p-3 bg-muted/20 border border-border/80 hover:border-emerald-500/50 rounded-lg space-y-1 group transition-all"
          >
            <span className="text-[11px] font-medium text-muted-foreground block truncate">
              6. Fulfilled
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-foreground group-hover:text-emerald-600 transition-colors">
                {fulfilledOrders.length}
              </span>
              <StatusBadge status="FULFILLED" className="text-[10px] py-0 px-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* 4. Attention Required Queue */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">
              Procurement Attention Queue
            </h3>
            {attentionItems.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-mono">
                {attentionItems.length} Pending Actions
              </span>
            )}
          </div>
          <Link href="/procurement/purchase-orders">
            <Button variant="ghost" size="xs" className="gap-1 text-xs text-muted-foreground">
              View All Orders
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {attentionItems.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>No pending procurement alerts. All purchase orders and receipts are proceeding on schedule.</span>
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
                      {item.poNumber}
                    </span>
                    <StatusBadge status={item.status} className="text-[10px] py-0 px-1" />
                  </div>
                  <p className="text-xs font-medium text-foreground truncate" title={item.supplierName}>
                    {item.supplierName}
                  </p>
                  <p className={`text-[11px] ${item.isUrgent ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {item.reason}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {formatCurrency(item.grandTotal)}
                  </span>
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

      {/* 5. Visualizations: Spend by Supplier & Status Ratio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Procurement Spend by Supplier"
            subtitle="Top vendor allocation across active and fulfilled orders"
          >
            {supplierSpendChartData.length > 0 ? (
              <BarChartWidget
                data={supplierSpendChartData}
                color="#1E90FF"
                height={220}
              />
            ) : (
              <p className="text-xs text-muted-foreground italic py-16 text-center">
                No purchase spend recorded yet.
              </p>
            )}
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Order Status Distribution"
            subtitle="Pipeline stage distribution ratio"
          >
            {statusChartData.length > 0 ? (
              <DonutChartWidget data={statusChartData} height={220} />
            ) : (
              <p className="text-xs text-muted-foreground italic py-16 text-center">
                No purchase orders created yet.
              </p>
            )}
          </ChartCard>
        </div>
      </div>

      {/* 6. Recent Activity & Secondary Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Purchase Orders */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Recent Purchase Orders
              </h3>
            </div>
            <Link href="/procurement/purchase-orders">
              <Button variant="ghost" size="xs" className="gap-1 text-xs text-muted-foreground">
                View All Orders
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              No purchase orders registered.
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
              {recentOrders.map((po) => {
                const supp = suppliersMap.get(po.supplierId);
                return (
                  <div
                    key={po.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/procurement/purchase-orders/${po.id}`}
                          className="font-mono font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {po.poNumber}
                        </Link>
                        <StatusBadge status={po.status} className="text-[10px] py-0 px-1.5" />
                      </div>
                      <p className="text-muted-foreground text-[11px] truncate">
                        {supp?.name || `Supplier #${po.supplierId.slice(0, 8)}`} • {po.lines?.length || 0} line items
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {formatCurrency(po.grandTotal, po.currency)}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(po.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 7. Quick Operations & Vendor Stats */}
        <div className="space-y-6">
          {/* Active Suppliers Summary */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Vendor & Supplier Network
            </h3>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground block">Active Suppliers</span>
                <span className="text-lg font-bold text-foreground font-mono">{suppliers.length}</span>
              </div>
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-[11px] text-muted-foreground block">Goods Receipts</span>
                <span className="text-lg font-bold text-foreground font-mono">{receipts.length}</span>
              </div>
            </div>
            <Link href="/procurement/master/suppliers" className="block pt-1">
              <Button variant="outline" size="xs" className="w-full text-xs gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Manage Suppliers Directory
              </Button>
            </Link>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              Procurement Quick Actions
            </h3>
            <div className="space-y-2">
              <Link href="/procurement/purchase-orders/new" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      New Purchase Order
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Create order to approved vendor
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
                      Record Goods Receipt (GRN)
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Inspect inbound deliveries
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/procurement/purchase-invoices" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Purchase Invoices
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Review billing against orders
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/procurement/supplier-returns" className="block group">
                <div className="p-2.5 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-center gap-2.5">
                  <div className="p-1.5 bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Supplier Returns
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Manage rejected deliveries
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
