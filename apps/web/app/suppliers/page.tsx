"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  X,
  Eye,
  Edit3,
  Trash2,
  Building2,
  CheckCircle2,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = React.useState<SupplierDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingSupplier, setEditingSupplier] =
    React.useState<SupplierDto | null>(null);
  const [deletingSupplier, setDeletingSupplier] =
    React.useState<SupplierDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);

  const fetchSuppliers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await suppliersApi.getAll();
      setSuppliers(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch suppliers from API");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const activeCount = React.useMemo(
    () => suppliers.filter((s) => s.isActive).length,
    [suppliers],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingSupplier) return;
    setDeleteLoading(true);
    setApiAlert(null);
    try {
      await suppliersApi.delete(deletingSupplier.id);
      setSuppliers((prev) => prev.filter((s) => s.id !== deletingSupplier.id));
      setToastMessage(
        `Supplier "${deletingSupplier.code}" deleted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
      setDeletingSupplier(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete supplier");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<SupplierDto>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <Link
            href={`/suppliers/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Supplier Name",
        cell: ({ row }) => (
          <Link
            href={`/suppliers/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "taxId",
        header: "Tax ID / GST",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.taxId || "—"}
          </span>
        ),
      },
      {
        accessorKey: "paymentTerms",
        header: "Terms",
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase px-2 py-0.5 border border-border rounded bg-card text-foreground">
            {row.original.paymentTerms}
          </span>
        ),
      },
      {
        accessorKey: "currency",
        header: "Currency",
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase text-foreground">
            {row.original.currency}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
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
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/suppliers/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit supplier"
              onClick={() => {
                setEditingSupplier(row.original);
                setIsFormOpen(true);
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete supplier"
              onClick={() => {
                setApiAlert(null);
                setDeletingSupplier(row.original);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [],
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

  const handleFormSuccess = (savedSupplier: SupplierDto) => {
    if (editingSupplier) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === savedSupplier.id ? savedSupplier : s)),
      );
      setToastMessage(`Supplier "${savedSupplier.code}" updated successfully.`);
    } else {
      setSuppliers((prev) => [savedSupplier, ...prev]);
      setToastMessage(`Supplier "${savedSupplier.code}" created successfully.`);
    }
    setIsFormOpen(false);
    setEditingSupplier(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Suppliers Management"
        description="Master vendor directory for purchasing, components mapping, and procurement workflows."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingSupplier(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Supplier
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Total Suppliers"
          value={suppliers.length}
          subtitle="Registered vendor directory"
          icon={Building2}
        />
        <StatCard
          title="Active Suppliers"
          value={activeCount}
          subtitle="Active procurement vendors"
          icon={Building2}
        />
      </div>

      {/* Notifications */}
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
          <Button variant="ghost" size="xs" onClick={fetchSuppliers}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                {editingSupplier ? "Edit Supplier" : "Create New Supplier"}
              </h2>
              <button
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingSupplier(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SupplierForm
              initialData={editingSupplier}
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingSupplier(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingSupplier)}
        title="Delete Supplier"
        description={`Are you sure you want to delete supplier "${deletingSupplier?.code}" (${deletingSupplier?.name})?`}
        confirmText="Delete Supplier"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingSupplier(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={suppliers}
        searchKey="name"
        searchPlaceholder="Search suppliers by name..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No suppliers found"
        emptyMessage="Get started by adding your first procurement supplier."
      />
    </div>
  );
}
