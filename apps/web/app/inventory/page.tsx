"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Boxes,
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

export default function InventoryPage() {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [comps, cats, locs] = await Promise.all([
        componentsApi.getAll(),
        categoriesApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);
      setComponents(comps);
      setCategories(cats);
      setLocations(locs);
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
        cell: ({ row }) => (
          <Link
            href={`/components/${row.original.id}`}
            className="font-mono text-xs text-primary font-semibold hover:underline"
          >
            {row.original.sku}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Description",
        cell: ({ row }) => (
          <div>
            <span className="font-medium text-foreground text-xs">
              {row.original.name}
            </span>
            {row.original.description && (
              <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "categoryId",
        header: "Category",
        cell: ({ row }) => {
          const catName = row.original.categoryId
            ? categoryMap.get(row.original.categoryId)
            : undefined;
          return (
            <span className="text-xs text-muted-foreground">
              {catName || "Unassigned"}
            </span>
          );
        },
      },
      {
        accessorKey: "defaultLocationId",
        header: "Default Location",
        cell: ({ row }) => {
          const locName = row.original.defaultLocationId
            ? locationMap.get(row.original.defaultLocationId)
            : undefined;
          return (
            <span className="text-xs text-muted-foreground">
              {locName || "Unassigned"}
            </span>
          );
        },
      },
      {
        accessorKey: "unit",
        header: "Unit",
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase">
            {row.original.unit}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${
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
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Link href={`/components/${row.original.id}`}>
              <Button size="sm" variant="ghost">
                <Eye className="w-3.5 h-3.5 mr-1" />
                View
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [categoryMap, locationMap],
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
          subtitle="Registered SKU records"
          icon={Boxes}
        />
        <StatCard
          title="Active SKUs"
          value={loading ? "..." : activeItemsCount}
          subtitle="Active inventory items"
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
        searchKey="sku"
        searchPlaceholder="Search inventory by SKU..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Inventory Items"
        emptyMessage="No inventory components have been registered yet."
      />
    </div>
  );
}
