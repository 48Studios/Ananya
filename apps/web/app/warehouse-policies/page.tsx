"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ShieldCheck,
  Plus,
  CheckCircle2,
  Edit2,
  Trash2,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { WarehousePolicyForm } from "@/components/warehouse/warehouse-policy-form";
import {
  warehousePoliciesApi,
  type WarehousePolicyDto,
} from "@/lib/api/warehouse-policies-api";

export default function WarehousePoliciesPage() {
  const [policies, setPolicies] = React.useState<WarehousePolicyDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingPolicy, setEditingPolicy] =
    React.useState<WarehousePolicyDto | null>(null);
  const [deletingPolicy, setDeletingPolicy] =
    React.useState<WarehousePolicyDto | null>(null);
  const [banner, setBanner] = React.useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fetchPolicies = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await warehousePoliciesApi.getAll();
      setPolicies(data || []);
    } catch (err: unknown) {
      setBanner({
        message:
          err instanceof Error
            ? err.message
            : "Failed to load storage policies",
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

  const handleOpenEdit = (pol: WarehousePolicyDto) => {
    setEditingPolicy(pol);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner(
      editingPolicy ? "Storage policy updated." : "Storage policy created.",
    );
    fetchPolicies();
  };

  const handleDelete = async () => {
    if (!deletingPolicy) return;
    try {
      await warehousePoliciesApi.delete(deletingPolicy.id);
      showBanner(`Storage policy "${deletingPolicy.policyName}" deleted.`);
      fetchPolicies();
    } catch (err: unknown) {
      showBanner(
        err instanceof Error ? err.message : "Failed to delete policy.",
        "error",
      );
    } finally {
      setDeletingPolicy(null);
    }
  };

  const fifoCount = React.useMemo(
    () => policies.filter((p) => p.pickingRule === "FIFO").length,
    [policies],
  );
  const fefoCount = React.useMemo(
    () => policies.filter((p) => p.pickingRule === "FEFO").length,
    [policies],
  );

  const columns: ColumnDef<WarehousePolicyDto>[] = [
    {
      accessorKey: "policyName",
      header: "Policy Rule Name",
      cell: ({ row }) => (
        <span className="font-medium text-xs text-foreground">
          {row.original.policyName}
        </span>
      ),
    },
    {
      accessorKey: "warehouseName",
      header: "Applies to Facility",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.warehouseName}
        </span>
      ),
    },
    {
      accessorKey: "pickingRule",
      header: "Picking Strategy",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.pickingRule}
        </span>
      ),
    },
    {
      accessorKey: "putawayRule",
      header: "Putaway Strategy",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.putawayRule}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => <RecordStatusBadge isActive={row.original.isActive} />,
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
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setDeletingPolicy(row.original)}
            title="Delete policy"
            aria-label="Delete policy"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Policies & Picking Rules"
        description="Configure FIFO, FEFO, putaway strategies, and automated bin selection rules."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Storage Policy
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Storage Policies"
          value={policies.length}
          icon={ShieldCheck}
        />
        <StatCard
          title="FIFO Picking Strategy"
          value={`${fifoCount} Policies`}
          icon={CheckCircle2}
        />
        <StatCard
          title="FEFO Expiry Rules"
          value={`${fefoCount} Policies`}
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
        searchPlaceholder="Search policies by name, strategy, or facility..."
        loading={loading}
        emptyTitle="No Storage Policies Found"
        emptyMessage="Click 'New Storage Policy' to create your first picking & putaway rule."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingPolicy ? "Edit Storage Policy" : "New Storage Policy"}
        description={
          editingPolicy
            ? "Update picking rules (FIFO/FEFO) and putaway strategies."
            : "Define picking strategies and automated putaway rules for warehouse facilities."
        }
        size="sm"
      >
        <WarehousePolicyForm
          initialData={editingPolicy}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      <ConfirmDialog
        isOpen={Boolean(deletingPolicy)}
        onCancel={() => setDeletingPolicy(null)}
        title="Delete Storage Policy"
        description={`Are you sure you want to delete policy "${deletingPolicy?.policyName}"?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
