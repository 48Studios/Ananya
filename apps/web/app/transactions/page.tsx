"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Eye,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Wrench,
  RotateCcw,
  MapPin,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
  type TransactionType,
} from "@/lib/api/inventory-transactions-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getTransactionBadge(type: TransactionType) {
  switch (type) {
    case "Receipt":
    case "InitialStock":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <ArrowDownLeft className="w-3 h-3 mr-1" />
          {type}
        </span>
      );
    case "Issue":
    case "Consumption":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          <ArrowUpRight className="w-3 h-3 mr-1" />
          {type}
        </span>
      );
    case "Transfer":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <ArrowRightLeft className="w-3 h-3 mr-1" />
          {type}
        </span>
      );
    case "Adjustment":
    case "ManualCorrection":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Wrench className="w-3 h-3 mr-1" />
          {type}
        </span>
      );
    case "Return":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
          <RotateCcw className="w-3 h-3 mr-1" />
          {type}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border">
          {type}
        </span>
      );
  }
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = React.useState<
    InventoryTransactionDto[]
  >([]);
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchTransactions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txs, comps, locs] = await Promise.all([
        inventoryTransactionsApi.getAll(),
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);
      setTransactions(txs);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch inventory transactions");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const receiptCount = React.useMemo(
    () =>
      transactions.filter((t) =>
        ["Receipt", "InitialStock"].includes(t.transactionType),
      ).length,
    [transactions],
  );
  const transferCount = React.useMemo(
    () => transactions.filter((t) => t.transactionType === "Transfer").length,
    [transactions],
  );
  const issueCount = React.useMemo(
    () =>
      transactions.filter((t) =>
        ["Issue", "Consumption", "Adjustment"].includes(t.transactionType),
      ).length,
    [transactions],
  );

  const columns = React.useMemo<ColumnDef<InventoryTransactionDto>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Transaction ID",
        cell: ({ row }) => (
          <Link
            href={`/transactions/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase"
          >
            {row.original.id.slice(0, 8)}
          </Link>
        ),
      },
      {
        accessorKey: "transactionType",
        header: "Type",
        cell: ({ row }) => getTransactionBadge(row.original.transactionType),
      },
      {
        accessorKey: "componentId",
        header: "Component",
        cell: ({ row }) => {
          const comp = componentsMap[row.original.componentId];
          return (
            <Link
              href={`/components/${row.original.componentId}`}
              className="font-medium text-xs text-foreground hover:underline"
            >
              {comp ? comp.name : row.original.componentId.slice(0, 8)}{" "}
              {comp && (
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({comp.sku})
                </span>
              )}
            </Link>
          );
        },
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => {
          const type = row.original.quantity;
          const sign = ["Issue", "Consumption"].includes(
            row.original.transactionType,
          )
            ? "-"
            : "+";
          return (
            <span className="font-mono text-xs font-bold text-foreground">
              {sign}
              {type} {row.original.unitOfMeasure}
            </span>
          );
        },
      },
      {
        id: "location",
        header: "Location",
        cell: ({ row }) => {
          const src = row.original.sourceLocationId
            ? locationsMap[row.original.sourceLocationId]
            : null;
          const dest = row.original.destinationLocationId
            ? locationsMap[row.original.destinationLocationId]
            : null;

          if (src && dest) {
            return (
              <span className="text-xs text-foreground font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                {src.code} → {dest.code}
              </span>
            );
          }
          const activeLoc = dest || src;
          return activeLoc ? (
            <span className="text-xs text-foreground font-medium flex items-center gap-1">
              <MapPin className="w-3 h-3 text-muted-foreground" />
              {activeLoc.name} ({activeLoc.code})
            </span>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">—</span>
          );
        },
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground uppercase">
            {row.original.reference || "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdBy",
        header: "Performed By",
        cell: ({ row }) => (
          <span className="text-xs text-foreground">
            {row.original.createdBy}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Timestamp",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/transactions/${row.original.id}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                title="View transaction details"
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [componentsMap, locationsMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "transactionType",
      title: "Transaction Type",
      options: [
        { label: "Receipt", value: "Receipt" },
        { label: "Issue", value: "Issue" },
        { label: "Transfer", value: "Transfer" },
        { label: "Adjustment", value: "Adjustment" },
        { label: "Return", value: "Return" },
        { label: "Consumption", value: "Consumption" },
        { label: "Production", value: "Production" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory Transactions"
        description="Immutable audit trail of all historical stock movements, receipts, issues, transfers, and adjustments."
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Ledger Entries"
          value={transactions.length}
          subtitle="All stock transactions"
          icon={Package}
        />
        <StatCard
          title="Receipts & Inbound"
          value={receiptCount}
          subtitle="Stock additions"
          icon={ArrowDownLeft}
        />
        <StatCard
          title="Transfers"
          value={transferCount}
          subtitle="Location movements"
          icon={ArrowRightLeft}
        />
        <StatCard
          title="Issues & Adjustments"
          value={issueCount}
          subtitle="Stock removals / fixes"
          icon={ArrowUpRight}
        />
      </div>

      {error && (
        <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchTransactions}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={transactions}
        searchKey="reference"
        searchPlaceholder="Search by reference ID or reason..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No inventory transactions found"
        emptyMessage="Stock movements will automatically populate this audit ledger as business operations occur."
      />
    </div>
  );
}
