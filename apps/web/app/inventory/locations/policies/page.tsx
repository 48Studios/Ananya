"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck, Plus, CheckCircle2, Edit2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { DialogShell } from "@/components/ui/dialog-shell";
import { WarehousePolicyForm } from "@/components/warehouse/warehouse-policy-form";
import { warehousePoliciesApi } from "@/lib/api/warehouse-policies-api";
import { warehousesApi } from "@/lib/api/warehouses-api";
import { locationsApi } from "@/lib/api/locations-api";
import {
  buildWarehousePolicyRows,
  describeRules,
  toLocationNameMap,
  toWarehouseNameMap,
  type WarehousePolicyRow,
} from "@/lib/warehouse-policies";
import { formatDate } from "@/lib/utils";

export default function WarehousePoliciesPage() {
  const [policies, setPolicies] = React.useState<WarehousePolicyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingPolicy, setEditingPolicy] =
    React.useState<WarehousePolicyRow | null>(null);
  const [banner, setBanner] = React.useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fetchPolicies = React.useCallback(async () => {
    setLoading(true);
    try {
      // A policy references a warehouse and its default bins by id; the labels
      // are resolved from the warehouses and locations APIs.
      const [rows, warehouses, locations] = await Promise.all([
        warehousePoliciesApi.getAll(),
        warehousesApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);
      setPolicies(
        buildWarehousePolicyRows(rows, {
          warehouseNames: toWarehouseNameMap(warehouses),
          locationNames: toLocationNameMap(locations),
        }),
      );
    } catch (err: unknown) {
      setBanner({
        message:
          err instanceof Error ? err.message : "Failed to load storage policies",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const showBanner = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingPolicy(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (policy: WarehousePolicyRow) => {
    setEditingPolicy(policy);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner(
      editingPolicy ? "Storage policy updated." : "Storage policy saved.",
    );
    fetchPolicies();
  };

  const directedPickingCount = React.useMemo(
    () => policies.filter((policy) => policy.directedPicking).length,
    [policies],
  );
  const capacityEnforcedCount = React.useMemo(
    () => policies.filter((policy) => policy.enforceBinCapacity).length,
    [policies],
  );

  const columns: ColumnDef<WarehousePolicyRow>[] = [
    {
      accessorKey: "warehouseLabel",
      header: "Facility",
      cell: ({ row }) => (
        <span className="font-medium text-xs text-foreground">
          {row.original.warehouseLabel || "Unknown warehouse"}
        </span>
      ),
    },
    {
      accessorKey: "directedPicking",
      header: "Rules",
      cell: ({ row }) => {
        const rules = describeRules(row.original);
        return (
          <span className="text-xs text-muted-foreground">
            {rules.length > 0 ? rules.join(" · ") : "No rules enabled"}
          </span>
        );
      },
    },
    {
      accessorKey: "defaultReceivingBin",
      header: "Default Bins",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">
            Receiving: {row.original.defaultReceivingBin || "Not set"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Production: {row.original.defaultProductionBin || "Not set"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Shipping: {row.original.defaultShippingBin || "Not set"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Configured",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.createdAt ? formatDate(row.original.createdAt) : "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="text-right block w-full">Actions</span>,
      meta: {
        width: "8%",
        headerClassName: "text-right",
        cellClassName: "text-right",
      },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => handleOpenEdit(row.original)}
            title="Edit policy"
            aria-label="Edit policy"
          >
            <Edit2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Policies & Picking Rules"
        description="Configure directed picking and putaway, bin capacity enforcement, and default bins per facility."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Storage Policy
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Configured Policies"
          value={policies.length}
          icon={ShieldCheck}
        />
        <StatCard
          title="Directed Picking"
          value={`${directedPickingCount} Facilities`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Bin Capacity Enforced"
          value={`${capacityEnforcedCount} Facilities`}
          icon={Package}
        />
      </div>

      <EntityDataTable
        notice={
          <>
            {banner && (
              <div
                className={`p-3 text-xs border rounded-md ${
                  banner.type === "error"
                    ? "bg-destructive/10 border-destructive/20 text-destructive"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {banner.message}
              </div>
            )}
          </>
        }
        data={policies}
        columns={columns}
        searchPlaceholder="Search policies by facility or rule..."
        loading={loading}
        emptyTitle="No Storage Policies Found"
        emptyMessage="Click 'New Storage Policy' to configure rules for a warehouse."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingPolicy ? "Edit Storage Policy" : "New Storage Policy"}
        description="Rules are saved against the selected warehouse; saving an existing facility updates its policy."
        size="sm"
      >
        <WarehousePolicyForm
          initialData={editingPolicy}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
