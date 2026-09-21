"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  ArrowLeft,
  ShoppingBag,
  Package,
  Star,
  Users,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DetailChip,
  DetailField,
  DetailFields,
  DetailMono,
  DetailMuted,
  DetailText,
} from "@/components/ui/detail-field";
import { DetailTable } from "@/components/ui/detail-table";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  RecordTimestamps,
  SectionCard,
  SectionCardFooter,
} from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";

/**
 * One supplier, as a master-data record.
 *
 * The page is ordered the way the record is read: what the vendor is, who to
 * reach, and what they supply. The purchasing summary counts real purchase
 * orders for this supplier rather than assuming none exist.
 */
export default function ViewSupplierPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [purchaseOrders, setPurchaseOrders] = React.useState<
    PurchaseOrderDto[]
  >([]);
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
      const [data, allComponents, orders] = await Promise.all([
        suppliersApi.getById(id),
        componentsApi.getAll().catch(() => []),
        purchaseOrdersApi.getAll({ supplierId: id }).catch(() => []),
      ]);
      setSupplier(data);
      setComponents(allComponents);
      setPurchaseOrders(orders);
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

  const componentMap = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const component of components) {
      map.set(component.id, component);
    }
    return map;
  }, [components]);

  const openPurchaseOrders = React.useMemo(
    () =>
      purchaseOrders.filter(
        (order) => order.status !== "FULFILLED" && order.status !== "CANCELLED",
      ).length,
    [purchaseOrders],
  );

  const completedPurchaseOrders = React.useMemo(
    () => purchaseOrders.filter((order) => order.status === "FULFILLED").length,
    [purchaseOrders],
  );

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
      {/* Header */}
      <PageHeader
        title={supplier.name}
        description={`Code: ${supplier.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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

      {/* Purchasing Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard
          className="p-3.5"
          title="Total Purchase Orders"
          value={purchaseOrders.length}
          subtitle="Issued & drafted"
          icon={ShoppingBag}
        />
        <StatCard
          className="p-3.5"
          title="Open Purchase Orders"
          value={openPurchaseOrders}
          subtitle="Awaiting fulfilment"
          icon={ShoppingBag}
        />
        <StatCard
          className="p-3.5"
          title="Completed Orders"
          value={completedPurchaseOrders}
          subtitle="Fulfilled & received"
          icon={CheckCircle2}
        />
        <StatCard
          className="p-3.5"
          title="Supplied Components"
          value={componentsList.length}
          subtitle="Mapped catalog items"
          icon={Package}
        />
      </div>

      {/* Supplier Information */}
      <SectionCard
        title="Supplier Information"
        description="Vendor commercial parameters and active status."
        icon={Info}
        contentClassName="p-0"
      >
        <DetailFields className="px-6 py-5">
          <DetailField label="Supplier ID">
            <DetailChip mono>{supplier.id}</DetailChip>
          </DetailField>

          <DetailField label="Status">
            <RecordStatusBadge isActive={supplier.isActive} />
          </DetailField>

          <DetailField label="Supplier Code">
            <DetailMono className="uppercase">{supplier.code}</DetailMono>
          </DetailField>

          <DetailField label="Supplier Name">
            <DetailText>{supplier.name}</DetailText>
          </DetailField>

          <DetailField label="Tax ID / GST">
            {supplier.taxId ? (
              <DetailMono>{supplier.taxId}</DetailMono>
            ) : (
              <DetailMuted>Not recorded</DetailMuted>
            )}
          </DetailField>

          <DetailField label="Payment Terms">
            <DetailMono className="uppercase">
              {supplier.paymentTerms}
            </DetailMono>
          </DetailField>

          <DetailField label="Default Currency">
            <DetailMono className="uppercase">{supplier.currency}</DetailMono>
          </DetailField>

          <DetailField label="Rating">
            <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {supplier.rating.toFixed(2)} / 5.00
            </span>
          </DetailField>
        </DetailFields>

        <SectionCardFooter>
          <RecordTimestamps
            createdAt={supplier.createdAt}
            updatedAt={supplier.updatedAt}
          />
        </SectionCardFooter>
      </SectionCard>

      {/* Supplier Contacts */}
      <SectionCard
        title="Supplier Contacts"
        description="People to reach for purchasing and commercial questions."
        icon={Users}
        contentClassName="p-0"
        actions={
          contactsList.length > 0 ? (
            <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {contactsList.length}{" "}
              {contactsList.length === 1 ? "contact" : "contacts"}
            </span>
          ) : null
        }
      >
        {contactsList.length > 0 ? (
          <DetailTable
            rows={contactsList}
            rowKey={(contact) => contact.id}
            columns={[
              {
                key: "name",
                header: "Name",
                width: "30%",
                className: "min-w-0",
                render: (contact) => (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {contact.name}
                    </span>
                    {contact.isPrimary ? (
                      <DetailChip className="border-primary/20 bg-primary/10 text-primary">
                        Primary
                      </DetailChip>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "role",
                header: "Role",
                width: "20%",
                className: "min-w-0",
                render: (contact) =>
                  contact.role ? (
                    <span className="text-xs text-muted-foreground truncate block">
                      {contact.role}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  ),
              },
              {
                key: "email",
                header: "Email",
                width: "30%",
                className: "min-w-0",
                render: (contact) =>
                  contact.email ? (
                    <span
                      className="font-mono text-xs text-foreground truncate block"
                      title={contact.email}
                    >
                      {contact.email}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  ),
              },
              {
                key: "phone",
                header: "Phone",
                width: "20%",
                className: "min-w-0",
                render: (contact) =>
                  contact.phone ? (
                    <span className="font-mono text-xs text-foreground truncate block">
                      {contact.phone}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  ),
              },
            ]}
          />
        ) : (
          <p className="px-6 py-5 text-xs text-muted-foreground">
            No contacts are registered for this supplier yet.
          </p>
        )}
      </SectionCard>

      {/* Supplied Components & Vendor Pricing */}
      <SectionCard
        title="Supplied Components & Vendor Pricing"
        description="Components this supplier is mapped to, with vendor part numbers and pricing."
        icon={Package}
        contentClassName="p-0"
        actions={
          componentsList.length > 0 ? (
            <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {componentsList.length}{" "}
              {componentsList.length === 1 ? "mapping" : "mappings"}
            </span>
          ) : null
        }
      >
        {componentsList.length > 0 ? (
          <DetailTable
            rows={componentsList}
            rowKey={(mapping) => mapping.id}
            columns={[
              {
                key: "component",
                header: "Component",
                width: "28%",
                className: "min-w-0",
                render: (mapping) => {
                  const component = componentMap.get(mapping.componentId);
                  return (
                    <>
                      <Link
                        href={`/components/${mapping.componentId}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline truncate block"
                      >
                        {component ? component.sku : mapping.componentId}
                      </Link>
                      <span className="text-xs text-foreground truncate block">
                        {component ? component.name : "Inventory Component"}
                      </span>
                    </>
                  );
                },
              },
              {
                key: "vendorPartNumber",
                header: "Vendor Part Number",
                width: "22%",
                className: "min-w-0",
                render: (mapping) => (
                  <span
                    className="font-mono text-xs text-foreground truncate block"
                    title={mapping.vendorPartNumber}
                  >
                    {mapping.vendorPartNumber}
                  </span>
                ),
              },
              {
                key: "leadTime",
                header: "Lead Time",
                align: "right",
                width: "14%",
                className: "whitespace-nowrap",
                render: (mapping) => (
                  <span className="text-xs text-foreground">
                    {mapping.leadTimeDays}{" "}
                    {mapping.leadTimeDays === 1 ? "day" : "days"}
                  </span>
                ),
              },
              {
                key: "moq",
                header: "MOQ",
                align: "right",
                width: "12%",
                className: "whitespace-nowrap",
                render: (mapping) => (
                  <span className="font-mono text-xs text-foreground">
                    {mapping.minimumOrderQuantity}
                  </span>
                ),
              },
              {
                key: "unitPrice",
                header: "Unit Price",
                align: "right",
                width: "14%",
                className: "whitespace-nowrap",
                render: (mapping) => (
                  <span className="font-mono text-xs font-bold text-foreground">
                    {mapping.currency} {mapping.unitPrice.toFixed(2)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                align: "right",
                width: "10%",
                render: (mapping) => (
                  <Link href={`/components/${mapping.componentId}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <p className="px-6 py-5 text-xs text-muted-foreground">
            No components are mapped to this supplier yet.
          </p>
        )}
      </SectionCard>

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
            setToastMessage(`Supplier "${updated.code}" updated successfully.`);
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
