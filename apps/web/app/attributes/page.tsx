"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Edit3,
  Trash2,
  Sliders,
  ListOrdered,
  Box,
  CheckCircle2,
  AlertCircle,
  Hash,
  Scale,
  Check,
  X,
  RefreshCw,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AttributeFormDialog } from "@/components/attributes/attribute-form-dialog";
import { AttributeOptionsDialog } from "@/components/attributes/attribute-options-dialog";
import { AttributeCategoriesDialog } from "@/components/attributes/attribute-categories-dialog";
import {
  attributesApi,
  type AttributeDefinitionDto,
} from "@/lib/api/attributes-api";

export default function AttributesPage() {
  const [attributes, setAttributes] = React.useState<AttributeDefinitionDto[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusAlert, setStatusAlert] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (statusAlert || error) {
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [statusAlert, error]);

  // Dialog states
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAttribute, setEditingAttribute] =
    React.useState<AttributeDefinitionDto | null>(null);
  const [optionsAttribute, setOptionsAttribute] =
    React.useState<AttributeDefinitionDto | null>(null);
  const [categoriesAttribute, setCategoriesAttribute] =
    React.useState<AttributeDefinitionDto | null>(null);
  const [deletingAttribute, setDeletingAttribute] =
    React.useState<AttributeDefinitionDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const fetchAttributes = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await attributesApi.getAll();
      setAttributes(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load attribute definitions.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  const handleDeleteConfirm = async () => {
    if (!deletingAttribute) return;
    setDeleteLoading(true);
    setStatusAlert(null);
    try {
      await attributesApi.deleteDefinition(deletingAttribute.id);
      setStatusAlert({
        type: "success",
        text: `Attribute '${deletingAttribute.name}' was successfully removed.`,
      });
      setDeletingAttribute(null);
      await fetchAttributes();
    } catch (err: unknown) {
      setStatusAlert({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Failed to delete attribute definition. It may be in use by categories or products.",
      });
      setDeletingAttribute(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Stats calculation
  const stats = React.useMemo(() => {
    const total = attributes.length;
    const quantities = attributes.filter((a) => a.dataType === "QUANTITY").length;
    const selects = attributes.filter(
      (a) => a.dataType === "SELECT" || a.dataType === "MULTI_SELECT",
    ).length;
    const filterable = attributes.filter((a) => a.isFilterable).length;
    return { total, quantities, selects, filterable };
  }, [attributes]);

  // Filters configuration
  const filterConfigs: FilterConfig[] = [
    {
      columnId: "dataType",
      title: "Data Type",
      options: [
        { label: "QUANTITY", value: "QUANTITY" },
        { label: "SELECT", value: "SELECT" },
        { label: "MULTI_SELECT", value: "MULTI_SELECT" },
        { label: "TEXT", value: "TEXT" },
        { label: "NUMBER", value: "NUMBER" },
        { label: "INTEGER", value: "INTEGER" },
        { label: "BOOLEAN", value: "BOOLEAN" },
        { label: "DATE", value: "DATE" },
      ],
    },
    {
      columnId: "isFilterable",
      title: "Filterable",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    {
      columnId: "isActive",
      title: "Status",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  // Table columns definition
  const columns = React.useMemo<ColumnDef<AttributeDefinitionDto>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Attribute Name",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <span className="font-medium text-foreground">
              {row.original.name}
            </span>
            {row.original.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "dataType",
        header: "Data Type",
        cell: ({ row }) => {
          const dt = row.original.dataType;
          const isQty = dt === "QUANTITY";
          const isSel = dt === "SELECT" || dt === "MULTI_SELECT";

          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                isQty
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  : isSel
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                    : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {dt}
            </span>
          );
        },
      },
      {
        id: "unitConfig",
        header: "Unit / Category",
        cell: ({ row }) => {
          const { unitCategory, defaultUnit, dataType } = row.original;
          if (dataType !== "QUANTITY") {
            return <span className="text-muted-foreground/60">—</span>;
          }
          return (
            <span className="text-xs text-muted-foreground font-mono">
              {defaultUnit ? (
                <strong className="text-foreground">{defaultUnit}</strong>
              ) : null}
              {unitCategory ? ` (${unitCategory})` : "—"}
            </span>
          );
        },
      },
      {
        id: "optionsCount",
        header: "Options",
        cell: ({ row }) => {
          const { dataType, options } = row.original;
          if (dataType !== "SELECT" && dataType !== "MULTI_SELECT") {
            return <span className="text-muted-foreground/60">—</span>;
          }
          const count = options?.length || 0;
          return (
            <span className="text-xs font-mono font-medium text-foreground">
              {count} {count === 1 ? "choice" : "choices"}
            </span>
          );
        },
      },
      {
        id: "categories",
        header: "Categories",
        cell: ({ row }) => {
          const attr = row.original;
          const bindings = attr.categoryBindings || [];
          if (bindings.length === 0) {
            return (
              <button
                type="button"
                onClick={() => setCategoriesAttribute(attr)}
                className="text-[11px] text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer font-mono"
                title="Click to bind to categories"
              >
                + Bind
              </button>
            );
          }
          const displayCategories = bindings.slice(0, 2);
          const remainingCount = bindings.length - 2;

          return (
            <button
              type="button"
              onClick={() => setCategoriesAttribute(attr)}
              className="flex items-center gap-1 flex-wrap max-w-[200px] text-left hover:opacity-80 transition-opacity cursor-pointer"
              title="Click to manage category bindings"
            >
              {displayCategories.map((b) => (
                <span
                  key={b.categoryId}
                  className="inline-flex items-center text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded border border-border text-foreground truncate max-w-[90px]"
                >
                  {b.categoryName}
                </span>
              ))}
              {remainingCount > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1 py-0.5 rounded border border-border">
                  +{remainingCount}
                </span>
              )}
            </button>
          );
        },
      },
      {
        accessorKey: "isFilterable",
        header: "Filterable",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              row.original.isFilterable
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }`}
          >
            {row.original.isFilterable ? (
              <>
                <Check className="w-3.5 h-3.5" /> Yes
              </>
            ) : (
              <>
                <X className="w-3.5 h-3.5 opacity-60" /> No
              </>
            )}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              row.original.isActive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                row.original.isActive ? "bg-emerald-500" : "bg-muted-foreground"
              }`}
            />
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const attr = row.original;
          const isSelectType =
            attr.dataType === "SELECT" || attr.dataType === "MULTI_SELECT";

          return (
            <div className="flex items-center justify-end gap-1">
              {isSelectType && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Manage Choices & Options"
                  onClick={() => setOptionsAttribute(attr)}
                  className="text-primary hover:text-primary hover:bg-primary/10"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon-xs"
                title="Manage Category Bindings"
                onClick={() => setCategoriesAttribute(attr)}
                className="text-muted-foreground hover:text-primary hover:bg-primary/10"
              >
                <FolderTree className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                title="Edit Definition"
                onClick={() => {
                  setEditingAttribute(attr);
                  setIsFormOpen(true);
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                title="Delete Definition"
                onClick={() => setDeletingAttribute(attr)}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attribute Library"
        description="Centralized catalog of dynamic technical specifications, physical parameters, units of measure, and choice sets."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/data-packs">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Box className="w-3.5 h-3.5 text-primary" />
                Data Packs Hub
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAttributes}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingAttribute(null);
                setIsFormOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              New Attribute
            </Button>
          </div>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Attributes"
          value={stats.total}
          subtitle="Defined specifications"
          icon={Sliders}
        />
        <StatCard
          title="Physical Quantities"
          value={stats.quantities}
          subtitle="Resistance, Voltage, Power..."
          icon={Scale}
        />
        <StatCard
          title="Choice & Select Sets"
          value={stats.selects}
          subtitle="Packages, Footprints, Types"
          icon={ListOrdered}
        />
        <StatCard
          title="Faceted Filterable"
          value={stats.filterable}
          subtitle="Enabled in catalog filters"
          icon={Hash}
        />
      </div>

      {/* Notifications */}
      <div ref={noticeRef} className="space-y-3">
        {statusAlert && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm font-medium ${
              statusAlert.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusAlert.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              )}
              <span>{statusAlert.text}</span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setStatusAlert(null)}
              className="text-xs"
            >
              Dismiss
            </Button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Attributes Table */}
      <EntityDataTable
        columns={columns}
        data={attributes}
        searchKey="name"
        searchPlaceholder="Search attributes by name or code..."
        filterConfigs={filterConfigs}
        loading={loading}
        emptyTitle="No attribute definitions found"
        emptyMessage="Create custom specifications or install domain specifications from the Data Packs Hub."
        actionButton={
          <Button
            size="sm"
            onClick={() => {
              setEditingAttribute(null);
              setIsFormOpen(true);
            }}
            className="gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            New Attribute
          </Button>
        }
      />

      {/* Create / Edit Dialog */}
      <AttributeFormDialog
        isOpen={isFormOpen}
        initialData={editingAttribute}
        onSuccess={(saved) => {
          setIsFormOpen(false);
          setEditingAttribute(null);
          setStatusAlert({
            type: "success",
            text: `Successfully saved attribute '${saved.name}'.`,
          });
          fetchAttributes();
        }}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingAttribute(null);
        }}
      />

      {/* Options Management Dialog */}
      <AttributeOptionsDialog
        isOpen={Boolean(optionsAttribute)}
        attribute={optionsAttribute}
        onClose={() => setOptionsAttribute(null)}
        onOptionsUpdated={fetchAttributes}
      />

      {/* Category Bindings Dialog */}
      <AttributeCategoriesDialog
        isOpen={Boolean(categoriesAttribute)}
        attribute={categoriesAttribute}
        onClose={() => setCategoriesAttribute(null)}
        onBindingsUpdated={fetchAttributes}
      />

      {/* Confirm Deletion Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingAttribute)}
        title="Delete Attribute Definition"
        description={`Are you sure you want to delete "${deletingAttribute?.name}" (${deletingAttribute?.code})? Global definitions referenced by categories or components cannot be safely deleted.`}
        confirmText="Delete Attribute"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingAttribute(null)}
      />
    </div>
  );
}
