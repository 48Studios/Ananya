"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  Edit3,
  Trash2,
  Package,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  MoreVertical,
  X,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ComponentForm } from "@/components/components/component-form";
import { PrintLabelDialog } from "@/components/barcodes/print-label-dialog";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import {
  attributesApi,
  type ResolvedCategoryAttributeDto,
} from "@/lib/api/attributes-api";
import { inventoryTransactionsApi } from "@/lib/api/inventory-transactions-api";

export default function ComponentsPage() {
  const router = useRouter();
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [stockMap, setStockMap] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingComponent, setEditingComponent] =
    React.useState<ComponentDto | null>(null);
  const [deletingComponent, setDeletingComponent] =
    React.useState<ComponentDto | null>(null);
  const [printingComponent, setPrintingComponent] =
    React.useState<ComponentDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (toastMessage || apiAlert || error) {
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [toastMessage, apiAlert, error]);

  // Dynamic Specifications Filter State
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("");
  const [categoryAttributes, setCategoryAttributes] = React.useState<
    ResolvedCategoryAttributeDto[]
  >([]);
  const [attributeFilters, setAttributeFilters] = React.useState<
    Record<string, { min?: string; max?: string; value?: string; booleanVal?: string }>
  >({});

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [comps, locs, txs, cats] = await Promise.all([
        componentsApi.getAll(),
        locationsApi.getAll().catch(() => []),
        inventoryTransactionsApi.getAll().catch(() => []),
        categoriesApi.getAll().catch(() => []),
      ]);
      setComponents(comps);
      setLocations(locs);
      setCategories(cats);

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
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch components from API");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load applicable category attribute definitions when a category is selected
  React.useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryAttributes([]);
      setAttributeFilters({});
      return;
    }
    attributesApi
      .getByCategory(selectedCategoryId)
      .then((attrs) => {
        setCategoryAttributes(attrs.filter((a) => a.attributeDefinition.isFilterable));
        setAttributeFilters({});
      })
      .catch(() => {
        setCategoryAttributes([]);
      });
  }, [selectedCategoryId]);

  const locationMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.code);
    }
    return map;
  }, [locations]);

  const categoryMap = React.useMemo(() => {
    const map = new Map<string, CategoryDto>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Real-time dynamic attribute & category filtering
  const filteredComponents = React.useMemo(() => {
    return components.filter((comp) => {
      // Category filter
      if (selectedCategoryId && comp.categoryId !== selectedCategoryId) {
        return false;
      }

      // Attribute specifications filters
      for (const [code, filter] of Object.entries(attributeFilters)) {
        if (!filter) continue;
        const compAttr = comp.attributes?.[code];

        // Select / Multi-Select / Text match
        if (filter.value && filter.value !== "ALL") {
          if (!compAttr) return false;
          const searchLower = filter.value.toLowerCase();
          const optCodeMatch = compAttr.optionCode?.toLowerCase() === searchLower;
          const optLabelMatch = compAttr.optionLabel?.toLowerCase() === searchLower;
          const dispValMatch = compAttr.displayValue?.toLowerCase().includes(searchLower);
          const rawValMatch = String(compAttr.value ?? "").toLowerCase().includes(searchLower);
          if (!optCodeMatch && !optLabelMatch && !dispValMatch && !rawValMatch) {
            return false;
          }
        }

        // Boolean filter
        if (filter.booleanVal && filter.booleanVal !== "ALL") {
          if (!compAttr) return false;
          const expected = filter.booleanVal === "true";
          const actual =
            compAttr.value === true ||
            compAttr.displayValue === "Yes" ||
            compAttr.displayValue === "true";
          if (actual !== expected) return false;
        }

        // Numeric min filter
        if (filter.min !== undefined && filter.min !== "") {
          const minNum = parseFloat(filter.min);
          if (!isNaN(minNum)) {
            if (!compAttr) return false;
            const valNum =
              compAttr.normalizedValue !== null && compAttr.normalizedValue !== undefined
                ? compAttr.normalizedValue
                : typeof compAttr.value === "number"
                ? compAttr.value
                : parseFloat(String(compAttr.value));
            if (isNaN(valNum) || valNum < minNum) return false;
          }
        }

        // Numeric max filter
        if (filter.max !== undefined && filter.max !== "") {
          const maxNum = parseFloat(filter.max);
          if (!isNaN(maxNum)) {
            if (!compAttr) return false;
            const valNum =
              compAttr.normalizedValue !== null && compAttr.normalizedValue !== undefined
                ? compAttr.normalizedValue
                : typeof compAttr.value === "number"
                ? compAttr.value
                : parseFloat(String(compAttr.value));
            if (isNaN(valNum) || valNum > maxNum) return false;
          }
        }
      }

      return true;
    });
  }, [components, selectedCategoryId, attributeFilters]);

  const activeFilterCount = React.useMemo(() => {
    let count = selectedCategoryId ? 1 : 0;
    for (const filter of Object.values(attributeFilters)) {
      if (
        (filter.value && filter.value !== "ALL") ||
        (filter.booleanVal && filter.booleanVal !== "ALL") ||
        (filter.min !== undefined && filter.min !== "") ||
        (filter.max !== undefined && filter.max !== "")
      ) {
        count++;
      }
    }
    return count;
  }, [selectedCategoryId, attributeFilters]);

  const handleClearAllFilters = () => {
    setSelectedCategoryId("");
    setAttributeFilters({});
  };

  const activeCount = React.useMemo(
    () => components.filter((c) => c.isActive).length,
    [components],
  );
  const uniqueUnitsCount = React.useMemo(
    () => new Set(components.map((c) => c.unit.toLowerCase())).size,
    [components],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingComponent) return;
    const targetSku = deletingComponent.sku;
    setDeleteLoading(true);
    setApiAlert(null);
    try {
      await componentsApi.delete(deletingComponent.id);
      setComponents((prev) =>
        prev.filter((c) => c.id !== deletingComponent.id),
      );
      setToastMessage(
        `Component "${targetSku}" deleted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete component");
      }
    } finally {
      setDeletingComponent(null);
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<ComponentDto>[]>(
    () => [
      {
        accessorKey: "sku",
        header: () => (
          <span className="whitespace-nowrap" title="SKU / Part Number">
            SKU
          </span>
        ),
        meta: { width: "12%" },
        cell: ({ row }) => (
          <Link
            href={`/components/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors block truncate"
            title={row.original.sku}
          >
            {row.original.sku}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: () => (
          <span className="whitespace-nowrap">Component</span>
        ),
        meta: { width: "18%" },
        cell: ({ row }) => {
          const attrs = row.original.attributes;
          const specBadges = attrs
            ? Object.values(attrs)
                .filter((a) => Boolean(a.displayValue))
                .slice(0, 3)
            : [];

          return (
            <div className="space-y-1">
              <Link
                href={`/components/${row.original.id}`}
                className="font-medium text-foreground hover:underline block truncate"
                title={row.original.name}
              >
                {row.original.name}
              </Link>
              {specBadges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {specBadges.map((badge, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground border border-border/50"
                    >
                      {badge.displayValue}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "categoryId",
        header: () => <span className="whitespace-nowrap">Category</span>,
        meta: { width: "12%" },
        cell: ({ row }) => {
          const catId = row.original.categoryId;
          const cat = catId ? categoryMap.get(catId) : undefined;
          return cat ? (
            <Link
              href={`/categories/${cat.id}`}
              className="text-xs font-medium text-foreground hover:underline block truncate"
              title={cat.name}
            >
              {cat.name}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          );
        },
      },
      {
        accessorKey: "description",
        header: () => (
          <span className="whitespace-nowrap">Description</span>
        ),
        meta: { width: "15%" },
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground truncate block"
            title={row.original.description || ""}
          >
            {row.original.description || "—"}
          </span>
        ),
      },
      {
        accessorKey: "unit",
        header: () => <span className="whitespace-nowrap">Unit</span>,
        meta: { width: "6%" },
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase px-2 py-0.5 border border-border rounded bg-card text-foreground whitespace-nowrap">
            {row.original.unit}
          </span>
        ),
      },
      {
        id: "stockOnHand",
        header: () => (
          <span className="whitespace-nowrap" title="Stock On Hand">
            On Hand
          </span>
        ),
        meta: { width: "10%" },
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
        header: () => (
          <span className="whitespace-nowrap" title="Default Storage Location">
            Storage
          </span>
        ),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const locId = row.original.defaultLocationId;
          if (!locId)
            return (
              <span className="text-xs text-muted-foreground italic">—</span>
            );
          const locCode = locationMap.get(locId);
          return locCode ? (
            <Link
              href={`/locations/${locId}`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground block truncate"
              title={locCode}
            >
              {locCode}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Assigned</span>
          );
        },
      },
      {
        accessorKey: "isActive",
        header: () => <span className="whitespace-nowrap">Status</span>,
        meta: { width: "9%" },
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
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
        header: () => (
          <span className="whitespace-nowrap text-right block w-full">
            Actions
          </span>
        ),
        meta: {
          width: "8%",
          headerClassName: "text-right",
          cellClassName: "text-right",
        },
        cell: ({ row }) => {
          const comp = row.original;
          return (
            <div className="flex items-center justify-end gap-1 whitespace-nowrap">
              <Button
                variant="ghost"
                size="icon-xs"
                title="Edit component"
                onClick={() => {
                  setEditingComponent(comp);
                  setIsFormOpen(true);
                }}
              >
                <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="More actions"
                      className="data-open:bg-muted"
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => router.push(`/components/${comp.id}`)}
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>View Details</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPrintingComponent(comp)}>
                    <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Print Label</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setApiAlert(null);
                      setDeletingComponent(comp);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [locationMap, categoryMap, stockMap, router],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "isActive",
      title: "Status",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  const handleFormSuccess = (savedComponent: ComponentDto) => {
    if (editingComponent) {
      setComponents((prev) =>
        prev.map((c) => (c.id === savedComponent.id ? savedComponent : c)),
      );
      setToastMessage(
        `Component "${savedComponent.sku}" updated successfully.`,
      );
    } else {
      setComponents((prev) => [savedComponent, ...prev]);
      setToastMessage(
        `Component "${savedComponent.sku}" created successfully.`,
      );
    }
    setIsFormOpen(false);
    setEditingComponent(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Components Management"
        description="Catalog of electronic parts, raw materials, hardware, and assemblies."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingComponent(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Component
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Components"
          value={components.length}
          subtitle="Master catalog items"
          icon={Package}
        />
        <StatCard
          title="Active Components"
          value={activeCount}
          subtitle="Currently active in ERP"
          icon={Package}
        />
        <StatCard
          title="Unit Diversity"
          value={uniqueUnitsCount}
          subtitle="Distinct units of measure"
          icon={Package}
        />
      </div>

      {/* Notifications */}
      <div ref={noticeRef} className="space-y-3">
        {toastMessage && (
          <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {apiAlert && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{apiAlert}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="ghost" size="xs" onClick={fetchData}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingComponent(null);
          }
        }}
        title={editingComponent ? "Edit Component" : "Create New Component"}
        description={
          editingComponent
            ? `Update component "${editingComponent.sku}" using the standardized dialog composition.`
            : "Create a new inventory component with shared header, scrollable body, and footer actions."
        }
        size="sm"
      >
        <ComponentForm
          initialData={editingComponent}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingComponent(null);
          }}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingComponent)}
        title="Delete Component"
        description={`Are you sure you want to delete component "${deletingComponent?.sku}" (${deletingComponent?.name})?`}
        confirmText="Delete Component"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingComponent(null)}
      />

      {/* Dynamic Specifications & Category Filter Bar */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Specifications & Category Filter
            </span>
            {activeFilterCount > 0 && (
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {activeFilterCount} active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Category Dropdown */}
            <div className="w-56">
              <Select
                value={selectedCategoryId || "ALL"}
                onValueChange={(val) =>
                  setSelectedCategoryId(val === "ALL" ? "" : (val ?? ""))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name} ({cat.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAllFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Category-Specific Dynamic Specification Filters */}
        {selectedCategoryId && categoryAttributes.length > 0 && (
          <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {categoryAttributes.map((attr) => {
              const def = attr.attributeDefinition;
              const current = attributeFilters[def.code] || {};

              if (def.dataType === "SELECT" || def.dataType === "MULTI_SELECT") {
                return (
                  <div key={def.code} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground block truncate">
                      {def.name}
                    </label>
                    <Select
                      value={current.value || "ALL"}
                      onValueChange={(val) =>
                        setAttributeFilters((prev) => ({
                          ...prev,
                          [def.code]: {
                            ...prev[def.code],
                            value: val === "ALL" || !val ? "" : val,
                          },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs font-mono">
                        <SelectValue placeholder={`All ${def.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All {def.name}</SelectItem>
                        {attr.options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.code}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (
                def.dataType === "QUANTITY" ||
                def.dataType === "NUMBER" ||
                def.dataType === "INTEGER"
              ) {
                return (
                  <div key={def.code} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground block truncate">
                      {def.name}{" "}
                      {def.defaultUnit ? `(${def.defaultUnit})` : ""}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={current.min || ""}
                        onChange={(e) =>
                          setAttributeFilters((prev) => ({
                            ...prev,
                            [def.code]: {
                              ...prev[def.code],
                              min: e.target.value,
                            },
                          }))
                        }
                        className="h-8 text-xs font-mono"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={current.max || ""}
                        onChange={(e) =>
                          setAttributeFilters((prev) => ({
                            ...prev,
                            [def.code]: {
                              ...prev[def.code],
                              max: e.target.value,
                            },
                          }))
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                );
              }

              if (def.dataType === "BOOLEAN") {
                return (
                  <div key={def.code} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground block truncate">
                      {def.name}
                    </label>
                    <Select
                      value={current.booleanVal || "ALL"}
                      onValueChange={(val) =>
                        setAttributeFilters((prev) => ({
                          ...prev,
                          [def.code]: {
                            ...prev[def.code],
                            booleanVal: val === "ALL" || !val ? "" : val,
                          },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Any</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (def.dataType === "TEXT") {
                return (
                  <div key={def.code} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground block truncate">
                      {def.name}
                    </label>
                    <Input
                      type="text"
                      placeholder={`Search ${def.name}...`}
                      value={current.value || ""}
                      onChange={(e) =>
                        setAttributeFilters((prev) => ({
                          ...prev,
                          [def.code]: {
                            ...prev[def.code],
                            value: e.target.value,
                          },
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={filteredComponents}
        entityType="Component"
        searchKey="name"
        searchPlaceholder="Search components by name..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No components found"
        emptyMessage="Get started by adding your first inventory component."
        minWidth={940}
      />

      {/* Print Component Label Modal */}
      {printingComponent && (
        <PrintLabelDialog
          isOpen={!!printingComponent}
          onClose={() => setPrintingComponent(null)}
          entityType="COMPONENT"
          entityId={printingComponent.id}
          defaultTemplate="STANDARD"
          title={`Print Component Label: ${printingComponent.sku}`}
        />
      )}
    </div>
  );
}
