"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Package,
  MapPin,
  Tags,
  Eye,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { inventoryTransactionsApi } from "@/lib/api/inventory-transactions-api";

export default function InventoryPage() {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [stockMap, setStockMap] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [comps, cats, locs, txs] = await Promise.all([
        componentsApi.getAll(),
        categoriesApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
        inventoryTransactionsApi.getAll().catch(() => []),
      ]);
      setComponents(comps);
      setCategories(cats);
      setLocations(locs);

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
        } else if (
          ["Issue", "Consumption"].includes(tx.transactionType)
        ) {
          computedStock[tx.componentId] = current - qty;
        } else if (tx.transactionType === "Adjustment") {
          computedStock[tx.componentId] = current + qty;
        }
      }
      setStockMap(computedStock);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categoryMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  const locationMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.name);
    }
    return map;
  }, [locations]);

  const columns: ColumnDef<ComponentDto>[] = React.useMemo(
    () => [
      {
        accessorKey: "sku",
        header: "SKU / Part No.",
        meta: {
          width: "17%",
          minWidth: "140px",
        },
        cell: ({ row }) => (
          <Link
            href={`/components/${row.original.id}`}
            className="font-mono text-xs text-primary font-semibold hover:underline block truncate"
            title={row.original.sku}
          >
            {row.original.sku}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Description",
        meta: {
          width: "26%",
          minWidth: "180px",
        },
        cell: ({ row }) => (
          <div className="min-w-0">
            <span
              className="font-medium text-foreground text-xs block truncate"
              title={row.original.name}
            >
              {row.original.name}
            </span>
            {row.original.description && (
              <p
                className="text-[11px] text-muted-foreground block truncate"
                title={row.original.description}
              >
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "categoryId",
        header: "Category",
        meta: {
          width: "11%",
          minWidth: "100px",
        },
        cell: ({ row }) => {
          const catName = row.original.categoryId
            ? categoryMap.get(row.original.categoryId)
            : undefined;
          return (
            <span
              className="text-xs text-muted-foreground block truncate"
              title={catName || "Unassigned"}
            >
              {catName || "Unassigned"}
            </span>
          );
        },
      },
      {
        id: "stockOnHand",
        header: "Stock On Hand",
        meta: {
          width: "11%",
          minWidth: "110px",
        },
        cell: ({ row }) => {
          const qty = stockMap[row.original.id] || 0;
          return (
            <span
              className={`font-mono text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap inline-block ${
                qty > 0
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
            >
              {qty} {row.original.unit}
            </span>
          );
        },
      },
      {
        accessorKey: "defaultLocationId",
        header: "Default Location",
        meta: {
          width: "12%",
          minWidth: "120px",
        },
        cell: ({ row }) => {
          const locName = row.original.defaultLocationId
            ? locationMap.get(row.original.defaultLocationId)
            : undefined;
          return (
            <span
              className="text-xs text-muted-foreground block truncate"
              title={locName || "Unassigned"}
            >
              {locName || "Unassigned"}
            </span>
          );
        },
      },
      {
        accessorKey: "unit",
        header: () => <span className="whitespace-nowrap">Unit</span>,
        meta: {
          width: "8%",
          minWidth: "85px",
        },
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase whitespace-nowrap">
            {row.original.unit}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: () => <span className="whitespace-nowrap">Status</span>,
        meta: {
          width: "8%",
          minWidth: "85px",
        },
        cell: ({ row }) => (
          <span
            className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${
              row.original.isActive
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: {
          width: "7%",
          minWidth: "85px",
        },
        cell: ({ row }) => (
          <div className="flex justify-end pr-1">
            <Link href={`/components/${row.original.id}`}>
              <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs gap-1">
                <Eye className="size-3.5" />
                View
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [categoryMap, locationMap, stockMap],
  );

  const filterConfigs: FilterConfig[] = React.useMemo(
    () => [
      {
        columnId: "categoryId",
        title: "Category",
        options: categories.map((c) => ({ label: c.name, value: c.id })),
      },
    ],
    [categories],
  );

  const activeItemsCount = components.filter((c) => c.isActive).length;
  const totalStockUnits = Object.values(stockMap).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Overview"
        description="Comprehensive inventory catalog, component tracking, and stock locations."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Link href="/components">
              <Button size="sm">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Manage Components
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Items"
          value={loading ? "..." : components.length}
          subtitle={`${activeItemsCount} active SKU records`}
          icon={Package}
        />
        <StatCard
          title="Total Stock Units"
          value={loading ? "..." : totalStockUnits}
          subtitle="In warehouse inventory"
          icon={Package}
        />
        <StatCard
          title="Categories"
          value={loading ? "..." : categories.length}
          subtitle="Taxonomy groups"
          icon={Tags}
        />
        <StatCard
          title="Locations"
          value={loading ? "..." : locations.length}
          subtitle="Storage bays & zones"
          icon={MapPin}
        />
      </div>

      <EntityDataTable
        data={components}
        columns={columns}
        entityType="Component"
        searchKey="sku"
        searchPlaceholder="Search inventory by SKU..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Inventory Items"
        emptyMessage="No inventory components have been registered yet."
        minWidth={920}
      />
    </div>
  );
}
