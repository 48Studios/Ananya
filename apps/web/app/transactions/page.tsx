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
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
          <ArrowDownLeft className="w-3 h-3 mr-1 shrink-0" />
          {type}
        </span>
      );
    case "Issue":
    case "Consumption":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap">
          <ArrowUpRight className="w-3 h-3 mr-1 shrink-0" />
          {type}
        </span>
      );
    case "Transfer":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap">
          <ArrowRightLeft className="w-3 h-3 mr-1 shrink-0" />
          {type}
        </span>
      );
    case "Adjustment":
    case "ManualCorrection":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
          <Wrench className="w-3 h-3 mr-1 shrink-0" />
          {type}
        </span>
      );
    case "Return":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 whitespace-nowrap">
          <RotateCcw className="w-3 h-3 mr-1 shrink-0" />
          {type}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border whitespace-nowrap">
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
        header: () => <span className="whitespace-nowrap">Transaction ID</span>,
        meta: { width: "135px", minWidth: "135px" },
        cell: ({ row }) => (
          <Link
            href={`/transactions/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted transition-colors uppercase whitespace-nowrap inline-block"
            title={row.original.id}
          >
            {row.original.id.slice(0, 8)}
          </Link>
        ),
      },
      {
        accessorKey: "transactionType",
        header: () => <span className="whitespace-nowrap">Type</span>,
        meta: { width: "100px", minWidth: "95px" },
        cell: ({ row }) => getTransactionBadge(row.original.transactionType),
      },
      {
        accessorKey: "componentId",
        header: () => <span className="whitespace-nowrap">Component</span>,
        meta: { minWidth: "180px" },
        cell: ({ row }) => {
          const comp = componentsMap[row.original.componentId];
          const fullName = comp
            ? `${comp.name} (${comp.sku})`
            : row.original.componentId;
          return (
            <div className="min-w-0" title={fullName}>
              <Link
                href={`/components/${row.original.componentId}`}
                className="font-medium text-xs text-foreground hover:underline truncate block"
              >
                {comp ? comp.name : row.original.componentId.slice(0, 8)}{" "}
                {comp && (
                  <span className="font-mono text-muted-foreground text-[11px]">
                    ({comp.sku})
                  </span>
                )}
              </Link>
            </div>
          );
        },
      },
      {
        accessorKey: "quantity",
        header: () => <span className="whitespace-nowrap">Quantity</span>,
        meta: { width: "105px", minWidth: "95px" },
        cell: ({ row }) => {
          const type = row.original.quantity;
          const sign = ["Issue", "Consumption"].includes(
            row.original.transactionType,
          )
            ? "-"
            : "+";
          return (
            <span className="font-mono text-xs font-bold text-foreground whitespace-nowrap">
              {sign}
              {type} {row.original.unitOfMeasure}
            </span>
          );
        },
      },
      {
        id: "location",
        header: () => <span className="whitespace-nowrap">Location</span>,
        meta: { width: "180px", minWidth: "150px" },
        cell: ({ row }) => {
          const src = row.original.sourceLocationId
            ? locationsMap[row.original.sourceLocationId]
            : null;
          const dest = row.original.destinationLocationId
            ? locationsMap[row.original.destinationLocationId]
            : null;

          if (src && dest) {
            const locText = `${src.code} → ${dest.code}`;
            return (
              <span
                className="text-xs text-foreground font-medium flex items-center gap-1 min-w-0"
                title={`${src.name} (${src.code}) → ${dest.name} (${dest.code})`}
              >
                <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{locText}</span>
              </span>
            );
          }
          const activeLoc = dest || src;
          return activeLoc ? (
            <span
              className="text-xs text-foreground font-medium flex items-center gap-1 min-w-0"
              title={`${activeLoc.name} (${activeLoc.code})`}
            >
              <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="truncate">
                {activeLoc.name}{" "}
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({activeLoc.code})
                </span>
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">—</span>
          );
        },
      },
      {
        accessorKey: "reference",
        header: () => <span className="whitespace-nowrap">Reference</span>,
        meta: { width: "125px", minWidth: "115px" },
        cell: ({ row }) => (
          <span
            className="font-mono text-xs text-muted-foreground uppercase truncate block"
            title={row.original.reference ? `Ref: ${row.original.reference} (By: ${row.original.createdBy})` : `By: ${row.original.createdBy}`}
          >
            {row.original.reference || "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: () => <span className="whitespace-nowrap">Timestamp</span>,
        meta: { width: "115px", minWidth: "110px" },
        cell: ({ row }) => {
          const d = new Date(row.original.createdAt);
          return (
            <span
              className="text-xs text-muted-foreground whitespace-nowrap block truncate font-mono"
              title={`${d.toLocaleString()} (By: ${row.original.createdBy})`}
            >
              {d.toLocaleDateString()}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => (
          <span className="whitespace-nowrap text-right block w-full">
            Actions
          </span>
        ),
        meta: {
          width: "75px",
          minWidth: "75px",
          headerClassName: "text-right",
        },
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
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
