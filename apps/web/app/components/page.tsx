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
  Sparkles,
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
import { ComponentForm } from "@/components/components/component-form";
import { ComponentReviewQueueDialog } from "@/components/components/component-review-queue-dialog";
import { PrintLabelDialog } from "@/components/barcodes/print-label-dialog";
import {
  ComponentsFilterCard,
  type AttributeFilterCriteria,
} from "@/components/components/components-filter-card";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { inventoryTransactionsApi } from "@/lib/api/inventory-transactions-api";
import { componentReviewQueueApi } from "@/lib/api/component-review-queue-api";
import { actionableFindingCount } from "@/lib/component-review-queue";

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

  // Component Intelligence Review opens as a modal, mirroring the Attribute
  // Library's Intelligence Queue — the catalog list is never navigated away from.
  const [isReviewQueueOpen, setIsReviewQueueOpen] = React.useState(false);
  const [reviewQueueCount, setReviewQueueCount] = React.useState(0);

  const refreshReviewQueueCount = React.useCallback(async () => {
    try {
      // The summary ignores the status filter, so one row is enough to read
      // every count the header chip needs.
      const queue = await componentReviewQueueApi.listFindings({
        page: 1,
        pageSize: 1,
      });
      setReviewQueueCount(actionableFindingCount(queue.summary));
    } catch {
      // The badge is informational; a failure must not disturb the catalog.
    }
  }, []);

  React.useEffect(() => {
    if (toastMessage || apiAlert || error) {
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [toastMessage, apiAlert, error]);

  // Dynamic Specifications & Category Filter State
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("");
  const [attributeFilters, setAttributeFilters] = React.useState<
    Record<string, AttributeFilterCriteria>
  >({});
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [activeOnly, setActiveOnly] = React.useState(false);

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

  React.useEffect(() => {
    void refreshReviewQueueCount();
  }, [refreshReviewQueueCount]);

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
      // In stock only
      if (inStockOnly && (stockMap[comp.id] || 0) <= 0) {
        return false;
      }

      // Active only
      if (activeOnly && !comp.isActive) {
        return false;
      }

      // Category filter
      if (selectedCategoryId && comp.categoryId !== selectedCategoryId) {
        return false;
      }

      // Attribute specifications filters
      for (const [code, criteria] of Object.entries(attributeFilters)) {
        if (!criteria) continue;
        const compAttr = comp.attributes?.[code];

        // Option-based filter (SELECT / MULTI_SELECT / Discrete values)
        if (criteria.selectedOptions && criteria.selectedOptions.length > 0) {
          if (!compAttr) return false;
          const searchCodes = criteria.selectedOptions.map((s) =>
            s.toLowerCase(),
          );
          const optCode = compAttr.optionCode?.toLowerCase();
          const optLabel = compAttr.optionLabel?.toLowerCase();
          const dispVal = compAttr.displayValue?.toLowerCase();
          const rawVal = String(compAttr.value ?? "").toLowerCase();

          const matchesSingle =
            (optCode && searchCodes.includes(optCode)) ||
            (optLabel && searchCodes.includes(optLabel)) ||
            (dispVal && searchCodes.includes(dispVal)) ||
            searchCodes.includes(rawVal);

          if (!matchesSingle) {
            if (Array.isArray(compAttr.value)) {
              const arr = compAttr.value.map((v) => String(v).toLowerCase());
              if (!arr.some((v) => searchCodes.includes(v))) {
                return false;
              }
            } else {
              return false;
            }
          }
        }

        // Boolean filter
        if (criteria.booleanVal && criteria.booleanVal !== "ALL") {
          if (!compAttr) return false;
          const expected = criteria.booleanVal === "true";
          const actual =
            compAttr.value === true ||
            compAttr.displayValue === "Yes" ||
            compAttr.displayValue === "true";
          if (actual !== expected) return false;
        }

        // Numeric / Quantity Relational filter
        const op = criteria.numericOperator || "BETWEEN";
        const hasMin = criteria.min !== undefined && criteria.min !== "";
        const hasMax = criteria.max !== undefined && criteria.max !== "";
        const hasTarget =
          criteria.targetValue !== undefined && criteria.targetValue !== "";

        if (hasMin || hasMax || hasTarget) {
          if (!compAttr) return false;
          const valNum =
            compAttr.normalizedValue !== null &&
              compAttr.normalizedValue !== undefined
              ? compAttr.normalizedValue
              : typeof compAttr.value === "number"
                ? compAttr.value
                : parseFloat(String(compAttr.value));

          if (isNaN(valNum)) return false;

          if (op === "BETWEEN") {
            if (hasMin && valNum < parseFloat(criteria.min!)) return false;
            if (hasMax && valNum > parseFloat(criteria.max!)) return false;
          } else if (op === "EQ") {
            if (
              hasTarget &&
              Math.abs(valNum - parseFloat(criteria.targetValue!)) > 0.0001
            ) {
              return false;
            }
          } else if (op === "GTE") {
            const threshold = parseFloat(
              criteria.targetValue || criteria.min || "0",
            );
            if (!isNaN(threshold) && valNum < threshold) return false;
          } else if (op === "LTE") {
            const threshold = parseFloat(
              criteria.targetValue || criteria.max || "0",
            );
            if (!isNaN(threshold) && valNum > threshold) return false;
          }
        }

        // Text search filter
        if (criteria.textSearch && criteria.textSearch.trim() !== "") {
          if (!compAttr) return false;
          const q = criteria.textSearch.toLowerCase().trim();
          const combined = `${compAttr.displayValue} ${compAttr.value} ${compAttr.optionLabel}`.toLowerCase();
          if (!combined.includes(q)) return false;
        }
      }

      return true;
    });
  }, [components, inStockOnly, activeOnly, stockMap, selectedCategoryId, attributeFilters]);

  const handleClearAllFilters = () => {
    setSelectedCategoryId("");
    setAttributeFilters({});
    setInStockOnly(false);
    setActiveOnly(false);
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
              className={`font-mono text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap inline-block ${qty > 0
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
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${row.original.isActive
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReviewQueueOpen(true)}
              className="gap-1.5 border-primary/30 text-xs text-primary hover:bg-primary/10"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Intelligence Review
              {reviewQueueCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 h-4 min-w-4 rounded-full bg-primary/15 text-primary border border-primary/25 text-[10px] font-mono font-medium">
                  {reviewQueueCount}
                </span>
              )}
            </Button>
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
          </div>
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
            ? `Update component "${editingComponent.sku}".`
            : "Create a new inventory component."
        }
        size="md"
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

      {/* Dynamic Specifications & Category Filter Card */}
      <ComponentsFilterCard
        components={components}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onCategoryChange={setSelectedCategoryId}
        attributeFilters={attributeFilters}
        onAttributeFiltersChange={setAttributeFilters}
        filteredComponents={filteredComponents}
        onClearAll={handleClearAllFilters}
        inStockOnly={inStockOnly}
        onInStockOnlyChange={setInStockOnly}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
      />

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

      {/* Component Intelligence Review Modal */}
      <ComponentReviewQueueDialog
        isOpen={isReviewQueueOpen}
        onClose={() => {
          setIsReviewQueueOpen(false);
          void refreshReviewQueueCount();
        }}
        onActionComplete={() => void refreshReviewQueueCount()}
      />
    </div>
  );
}
