"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus, CheckCircle2, Clock, DollarSign, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PurchaseInvoiceForm } from "@/components/procurement/purchase-invoice-form";
import {
  purchaseInvoicesApi,
  type PurchaseInvoiceDto,
} from "@/lib/api/purchase-invoices-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = React.useState<PurchaseInvoiceDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingInvoice, setEditingInvoice] = React.useState<PurchaseInvoiceDto | null>(null);
  const [deletingInvoice, setDeletingInvoice] = React.useState<PurchaseInvoiceDto | null>(null);
  const [banner, setBanner] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchInvoices = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await purchaseInvoicesApi.getAll();
      setInvoices(data || []);
    } catch (err: unknown) {
      setBanner({
        message: err instanceof Error ? err.message : "Failed to load vendor invoices",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const showBanner = (message: string, type: "success" | "error" = "success") => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingInvoice(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (inv: PurchaseInvoiceDto) => {
    setEditingInvoice(inv);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner(editingInvoice ? "Vendor invoice updated." : "Vendor invoice entered.");
    fetchInvoices();
  };

  const handleDelete = async () => {
    if (!deletingInvoice) return;
    try {
      await purchaseInvoicesApi.delete(deletingInvoice.id);
      showBanner(`Invoice "${deletingInvoice.invoiceNumber}" deleted.`);
      fetchInvoices();
    } catch (err: unknown) {
      showBanner(err instanceof Error ? err.message : "Failed to delete invoice.", "error");
    } finally {
      setDeletingInvoice(null);
    }
  };

  const outstandingAmount = React.useMemo(
    () =>
      invoices
        .filter((i) => i.status === "UNPAID" || i.status === "PARTIAL")
        .reduce((acc, i) => acc + (i.amount || 0), 0),
    [invoices],
  );

  const paidCount = React.useMemo(
    () => invoices.filter((i) => i.status === "PAID").length,
    [invoices],
  );

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Payment Status",
      options: [
        { label: "Unpaid", value: "UNPAID" },
        { label: "Partial", value: "PARTIAL" },
        { label: "Paid", value: "PAID" },
      ],
    },
  ];

  const columns: ColumnDef<PurchaseInvoiceDto>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Supplier Invoice No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      accessorKey: "supplierName",
      header: "Supplier",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.supplierName}
        </span>
      ),
    },
    {
      accessorKey: "poNumber",
      header: "Ref PO",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.poNumber}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Invoice Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "PAID") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> {s}
          </span>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.dueDate)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleOpenEdit(row.original)}
            title="Edit invoice"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDeletingInvoice(row.original)}
            title="Delete invoice"
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

      <PageHeader
        title="Purchase Invoices & AP Bills"
        description="Process vendor invoices, match purchase orders to bills, and manage accounts payable schedules."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Enter Vendor Invoice
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Invoices"
          value={invoices.length}
          icon={FileText}
        />
        <StatCard
          title="Outstanding Payable"
          value={formatCurrency(outstandingAmount)}
          icon={DollarSign}
        />
        <StatCard
          title="Paid Invoices"
          value={paidCount}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={invoices}
        columns={columns}
        searchPlaceholder="Search vendor invoices by number, supplier, or PO..."
        loading={loading}
        emptyTitle="No Vendor Invoices Found"
        emptyMessage="Click 'Enter Vendor Invoice' to record a new accounts payable bill."
        filterConfigs={filterConfigs}
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingInvoice ? "Edit Vendor Invoice" : "Enter Vendor Invoice"}
        description={
          editingInvoice
            ? "Update vendor invoice details, purchase order references, or payment status."
            : "Process new vendor invoices, match purchase orders, and schedule accounts payable."
        }
        size="md"
      >
        <PurchaseInvoiceForm
          initialData={editingInvoice}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      <ConfirmDialog
        isOpen={Boolean(deletingInvoice)}
        onCancel={() => setDeletingInvoice(null)}
        title="Delete Vendor Invoice"
        description={`Are you sure you want to delete invoice "${deletingInvoice?.invoiceNumber}"?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
