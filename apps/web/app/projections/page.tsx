"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp, CheckCircle2, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ChartCard } from "@/components/charts/chart-card";
import { AreaChartWidget } from "@/components/charts/area-chart-widget";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  reportingApi,
  type CashFlowForecastDto,
  type CashFlowForecastPeriodDto,
} from "@/lib/api/reporting-api";
import { formatCurrency } from "@/lib/utils";

export default function ProjectionsPage() {
  const [forecast, setForecast] = React.useState<CashFlowForecastDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadForecast = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setForecast(await reportingApi.getCashFlowForecast());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load cash flow forecast",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const totalProjectedNet = React.useMemo(
    () =>
      (forecast?.periods ?? []).reduce(
        (acc, period) => acc + period.netCashFlow,
        0,
      ),
    [forecast],
  );

  const endingReserve = React.useMemo(
    () =>
      forecast?.periods.length
        ? forecast.periods[forecast.periods.length - 1]?.endingLiquidityReserve ?? 0
        : 0,
    [forecast],
  );

  const columns: ColumnDef<CashFlowForecastPeriodDto>[] = [
    {
      accessorKey: "periodLabel",
      header: "Forecast Month",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-primary">
          {row.original.periodLabel}
        </span>
      ),
    },
    {
      accessorKey: "projectedInflow",
      header: "Projected Revenue Inflow",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          +{formatCurrency(row.original.projectedInflow)}
        </span>
      ),
    },
    {
      accessorKey: "projectedOutflow",
      header: "Projected Expense Outflow",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
          -{formatCurrency(row.original.projectedOutflow)}
        </span>
      ),
    },
    {
      accessorKey: "netCashFlow",
      header: "Net Monthly Cash Flow",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          +{formatCurrency(row.original.netCashFlow)}
        </span>
      ),
    },
    {
      accessorKey: "endingLiquidityReserve",
      header: "Ending Reserve Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.endingLiquidityReserve === null
            ? "Unavailable"
            : formatCurrency(row.original.endingLiquidityReserve)}
        </span>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading financial projections..." />;
  }

  if (error || !forecast) {
    return (
      <ErrorState
        title="Forecast unavailable"
        message={error || "Unable to load cash flow forecast data."}
        onRetry={loadForecast}
      />
    );
  }

  const chartData = forecast.periods.map((period) => ({
    name: period.periodLabel,
    value: period.netCashFlow,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Projections & Cash Flow Forecast"
        description="Forward-looking cash flow projections, working capital trends, and revenue liquidity models."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Projected Cumulative Net Inflow"
          value={formatCurrency(totalProjectedNet)}
          icon={TrendingUp}
        />
        <StatCard
          title="Projected Ending Reserve"
          value={formatCurrency(endingReserve)}
          icon={DollarSign}
        />
        <StatCard
          title="Model Forecast Engine"
          value={forecast.periods.length > 0 ? "Real due-date forecast" : "No forecast available"}
          icon={CheckCircle2}
        />
      </div>

      <ChartCard
        title="Net cash flow outlook"
        subtitle="Derived from posted receivable and payable balances with future due dates"
      >
        {forecast.periods.length > 0 ? (
          <AreaChartWidget data={chartData} color="#0ea5e9" height={220} />
        ) : (
          <EmptyState
            title="No forecast available"
            description={
              forecast.insufficientDataReason ||
              "There is not enough transactional history to produce a forecast."
            }
          />
        )}
      </ChartCard>

      <EntityDataTable
        data={forecast.periods}
        columns={columns}
        searchPlaceholder="Search projection periods..."
        loading={false}
        emptyTitle="No Projections Available"
        emptyMessage={
          forecast.insufficientDataReason ||
          "There is not enough transactional history to produce a forecast."
        }
      />
    </div>
  );
}
