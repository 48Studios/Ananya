"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  ArrowLeft,
  Building2,
  ShoppingBag,
  Package,
  Star,
  Mail,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";

export default function ViewSupplierPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await suppliersApi.getById(id);
      setSupplier(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load supplier details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await suppliersApi.delete(id);
      router.push("/suppliers");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete supplier");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading supplier details..." />;
  }

  if (error || !supplier) {
    return (
      <ErrorState
        title="Supplier Not Found"
        message={error || "The requested supplier record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  const contactsList = supplier.contacts ?? [];
  const componentsList = supplier.components ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={supplier.name}
        description={`Code: ${supplier.code}`}
        breadcrumbs={[
          { label: "Suppliers", href: "/suppliers" },
          { label: supplier.code },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/suppliers")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setIsDeleteOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </div>
        }
      />

      {/* Notifications */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {deleteError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {deleteError}
        </div>
      )}

      {/* Stat Cards Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Purchase Orders"
          value="0"
          subtitle="Issued PO count"
          icon={ShoppingBag}
        />
        <StatCard
          title="Open Purchase Orders"
          value="0"
          subtitle="Active open orders"
          icon={ShoppingBag}
        />
        <StatCard
          title="Completed Orders"
          value="0"
          subtitle="Fulfilled & received"
          icon={ShoppingBag}
        />
        <StatCard
          title="Supplied Components"
          value={componentsList.length}
          subtitle="Mapped catalog items"
          icon={Package}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Company Information Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Company Information
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vendor commercial parameters and active status.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Supplier ID
              </dt>
              <dd className="mt-1 font-mono text-xs text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
                {supplier.id}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                    supplier.isActive
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {supplier.isActive ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Supplier Code
              </dt>
              <dd className="mt-1 font-mono text-xs font-semibold text-foreground uppercase">
                {supplier.code}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Supplier Name
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {supplier.name}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Tax ID / GST
              </dt>
              <dd className="mt-1 font-mono text-xs text-foreground">
                {supplier.taxId || "—"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Payment Terms
              </dt>
              <dd className="mt-1 font-mono text-xs uppercase text-foreground">
                {supplier.paymentTerms}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Default Currency
              </dt>
              <dd className="mt-1 font-mono text-xs uppercase text-foreground">
                {supplier.currency}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Rating
              </dt>
              <dd className="mt-1 flex items-center gap-1 text-xs text-foreground font-semibold">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{supplier.rating.toFixed(2)} / 5.00</span>
              </dd>
            </div>
          </dl>

          {/* Audit Timestamps */}
          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Created: {new Date(supplier.createdAt).toLocaleString()}
            </span>
            <span>
              Updated: {new Date(supplier.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Contacts Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              Supplier Contacts ({contactsList.length})
            </h3>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>

          {contactsList.length > 0 ? (
            <div className="space-y-3">
              {contactsList.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3 bg-muted/30 border border-border rounded-lg space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {contact.name}
                    </span>
                    {contact.isPrimary && (
                      <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                  {contact.role && (
                    <p className="text-xs text-muted-foreground">
                      {contact.role}
                    </p>
                  )}
                  <div className="flex flex-col gap-1 pt-1 text-xs text-muted-foreground">
                    {contact.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span>{contact.email}</span>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        <span>{contact.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No contacts registered for this supplier.
            </p>
          )}
        </div>
      </div>

      {/* Supplied Components Listing */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Supplied Components & Vendor Pricing ({componentsList.length})
        </h3>

        {componentsList.length > 0 ? (
          <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {componentsList.map((cp) => (
              <div
                key={cp.id}
                className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded font-medium">
                    VPN: {cp.vendorPartNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Lead Time: {cp.leadTimeDays} days | MOQ:{" "}
                    {cp.minimumOrderQuantity}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {cp.currency} {cp.unitPrice.toFixed(2)}
                  </span>
                  <Link href={`/components/${cp.componentId}`}>
                    <Button variant="ghost" size="xs">
                      View Component →
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No component price mappings currently set up for this vendor.
          </p>
        )}
      </div>

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Supplier"
        description={`Update supplier "${supplier.code}" for purchasing, payment, and tax tracking.`}
        size="sm"
      >
        <SupplierForm
          initialData={supplier}
          onSuccess={(updated) => {
            setSupplier(updated);
            setIsEditOpen(false);
            setToastMessage(
              `Supplier "${updated.code}" updated successfully.`,
            );
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Supplier"
        description={`Are you sure you want to delete supplier "${supplier.code}" (${supplier.name})? This action cannot be undone.`}
        confirmText="Delete Supplier"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
