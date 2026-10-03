"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { warrantyClaimsApi } from "@/lib/api/warranty-claims-api";
import { customersApi } from "@/lib/api/customers-api";
import { componentsApi } from "@/lib/api/components-api";
import { toCustomerNameMap } from "@/lib/service-requests";
import {
  buildWarrantyClaimRows,
  toProductNameMap,
  type WarrantyClaimRow,
} from "@/lib/warranty";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { WarrantyClaimForm } from "@/components/warranty/warranty-claim-form";

export default function WarrantyPage() {
  const [claims, setClaims] = React.useState<WarrantyClaimRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchClaims = React.useCallback(() => {
    setLoading(true);
    // A claim carries `customerId` and `productId`; both labels are resolved
    // from their own APIs. A caller without that read access still sees claims.
    Promise.all([
      warrantyClaimsApi.getAll(),
      customersApi.getAll().catch(() => []),
      componentsApi.getAll().catch(() => []),
    ])
      .then(([rows, customers, components]) =>
        setClaims(
          buildWarrantyClaimRows(rows, {
            customerNames: toCustomerNameMap(customers),
            productNames: toProductNameMap(components),
          }),
        ),
      )
      .catch(() => setClaims([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchClaims();
  };

  const columns: ColumnDef<WarrantyClaimRow>[] = [
    {
      accessorKey: "claimNumber",
      header: "Claim Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase font-bold inline-block truncate max-w-full align-middle">
          {row.original.claimNumber}
        </span>
      ),
    },
    {
      accessorKey: "serialNumber",
      header: "Serial Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-0.5 rounded uppercase font-bold">
          {row.original.serialNumber || "-"}
        </span>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer & Product",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-xs text-foreground">
            {row.original.customerName || "Unassigned customer"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.productLabel || "Unknown product"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "claimReason",
      header: "Claim Reason",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-xs truncate block">
          {row.original.claimReason}
        </span>
      ),
    },
    {
      accessorKey: "decision",
      header: "Decision",
      cell: ({ row }) => (
        <StatusBadge status={row.original.decision || "SUBMITTED"} />
      ),
    },
    {
      accessorKey: "reportedAt",
      header: "Date Filed",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.reportedAt ? formatDate(row.original.reportedAt) : "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warranty & Serial Number Guarantees"
        description="Track product warranty claims, serial number guarantees, and customer return authorizations."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            File New Warranty Claim
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Claims Filed"
          value={claims.length}
          icon={FileText}
        />
        <StatCard
          title="Awaiting Decision"
          value={
            claims.filter(
              (c) => c.decision === "SUBMITTED" || c.decision === "UNDER_REVIEW",
            ).length
          }
          icon={Clock}
        />
        <StatCard
          title="Approved Claims"
          value={claims.filter((c) => c.decision === "APPROVED").length}
          icon={ShieldCheck}
        />
      </div>

      <EntityDataTable
        data={claims}
        columns={columns}
        entityType="Warranty"
        searchPlaceholder="Search claims by number, serial, customer, or product..."
        loading={loading}
        emptyTitle="No Warranty Claims"
        emptyMessage="No active warranty claims match your query."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="File New Warranty Claim"
        description="Submit a new product warranty claim or serial number guarantee case."
        size="sm"
      >
        <WarrantyClaimForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
