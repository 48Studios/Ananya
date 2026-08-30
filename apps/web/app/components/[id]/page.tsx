"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  ArrowLeft,
  Package,
  Layers,
  MapPin,
  Activity,
  CheckCircle2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ComponentForm } from "@/components/components/component-form";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
} from "@/lib/api/inventory-transactions-api";

export default function ViewComponentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [component, setComponent] = React.useState<ComponentDto | null>(null);
  const [defaultLocation, setDefaultLocation] =
    React.useState<LocationDto | null>(null);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [projections, setProjections] = React.useState<
    InventoryProjectionDto[]
  >([]);
  const [transactions, setTransactions] = React.useState<
    InventoryTransactionDto[]
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
      const [comp, compProjections, compTransactions, allLocs] =
        await Promise.all([
          componentsApi.getById(id),
          inventoryProjectionsApi.getByComponent(id).catch(() => []),
          inventoryTransactionsApi.getAll({ componentId: id }).catch(() => []),
          locationsApi.getAll().catch(() => []),
        ]);

      setComponent(comp);
      setProjections(compProjections);
      setTransactions(compTransactions);
      setLocations(allLocs);

      if (comp.defaultLocationId) {
        const foundDef = allLocs.find((l) => l.id === comp.defaultLocationId);
        setDefaultLocation(foundDef || null);
      } else {
        setDefaultLocation(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load component details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const locationMap = React.useMemo(() => {
    const map = new Map<string, LocationDto>();
    for (const loc of locations) {
      map.set(loc.id, loc);
    }
    return map;
  }, [locations]);

  const currentStock = React.useMemo(() => {
    if (projections.length > 0) {
      return projections.reduce((sum, p) => sum + Number(p.quantity), 0);
    }
    // Fallback compute directly from transaction history if projections haven't built yet
    if (transactions.length > 0) {
      return transactions.reduce((sum, tx) => {
        const qty = Number(tx.quantity) || 0;
        if (
          ["Receipt", "Return", "Production", "InitialStock"].includes(
            tx.transactionType,
          )
        ) {
          return sum + qty;
        } else if (
          ["Issue", "Consumption"].includes(tx.transactionType)
        ) {
          return sum - qty;
        } else if (tx.transactionType === "Adjustment") {
          return sum + qty;
        }
        return sum;
      }, 0);
    }
    return 0;
  }, [projections, transactions]);

  const availableStock = currentStock;

  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await componentsApi.delete(id);
      router.push("/components");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete component");
      }
    } finally {
      setIsDeleteOpen(false);
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading component details..." />;
  }

  if (error || !component) {
    return (
      <ErrorState
        title="Component Not Found"
        message={error || "The requested inventory component does not exist."}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={component.name}
        description={`SKU: ${component.sku}`}
        breadcrumbs={[
          { label: "Components", href: "/components" },
          { label: component.sku },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/components")}
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

      {/* Inventory Summary Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Current Stock"
          value={`${currentStock} ${component.unit}`}
          subtitle="On-hand ledger total"
          icon={Package}
        />
        <StatCard
          title="Reserved"
          value={`0 ${component.unit}`}
          subtitle="Allocated orders"
          icon={Layers}
        />
        <StatCard
          title="Available"
          value={`${availableStock} ${component.unit}`}
          subtitle="Net unallocated stock"
          icon={Package}
        />
        <StatCard
          title="Reorder Level"
          value={`10 ${component.unit}`}
          subtitle="Safety threshold"
          icon={Activity}
        />
        <StatCard
          title="Min Stock"
          value={`5 ${component.unit}`}
          subtitle="Floor balance"
          icon={Activity}
        />
        <StatCard
          title="Max Stock"
          value={`100 ${component.unit}`}
          subtitle="Ceiling limit"
          icon={Activity}
        />
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Basic Information Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Basic Information
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Core inventory master parameters and classification.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Component ID
              </dt>
              <dd className="mt-1 font-mono text-xs text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
                {component.id}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                    component.isActive
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {component.isActive ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                SKU / Part Number
              </dt>
              <dd className="mt-1 font-mono text-xs font-semibold text-foreground">
                {component.sku}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Default Unit
              </dt>
              <dd className="mt-1 font-mono text-xs uppercase text-foreground">
                {component.unit}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Manufacturer
              </dt>
              <dd className="mt-1 text-xs text-muted-foreground">
                {component.manufacturerId
                  ? component.manufacturerId
                  : "Unassigned"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Category
              </dt>
              <dd className="mt-1 text-xs text-muted-foreground">
                {component.categoryId ? component.categoryId : "Unassigned"}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Description
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {component.description || "No description provided."}
              </dd>
            </div>
          </dl>

          {/* Audit Timestamps */}
          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Created: {new Date(component.createdAt).toLocaleString()}
            </span>
            <span>
              Updated: {new Date(component.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Location & Recent Activity Card */}
        <div className="space-y-6">
          {/* Storage Assignment & Breakdown */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Storage Stock Balances
              </h3>
              <MapPin className="w-4 h-4 text-muted-foreground" />
            </div>

            {projections.length > 0 ? (
              <div className="space-y-2">
                {projections.map((proj) => {
                  const loc = locationMap.get(proj.locationId);
                  return (
                    <div
                      key={proj.id}
                      className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {loc ? loc.code : proj.locationId}
                          </span>
                          {loc && (
                            <span className="text-[10px] capitalize px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                              {loc.kind}
                            </span>
                          )}
                        </div>
                        {loc && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {loc.name}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-sm font-bold text-foreground">
                        {proj.quantity} {component.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : defaultLocation ? (
              <div className="space-y-2 p-3 bg-muted/30 border border-border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {defaultLocation.code}
                  </span>
                  <span className="text-xs capitalize px-2 py-0.5 bg-muted rounded">
                    {defaultLocation.kind}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {defaultLocation.name}
                </p>
                <div className="flex justify-between items-center pt-2 border-t border-border/60 text-xs">
                  <span className="text-muted-foreground">Stock On Hand:</span>
                  <span className="font-mono font-bold text-foreground">
                    {currentStock} {component.unit}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No stock stored in warehouse locations yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transaction Movement Ledger Card */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              Inventory Transaction Ledger
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auditable movement history posted to the inventory ledger.
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {transactions.length} movements
          </span>
        </div>

        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground font-medium text-xs border-b border-border">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3 text-right">Quantity</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Reference / Reason</th>
                  <th className="px-6 py-3">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.map((tx) => {
                  const targetLoc = tx.destinationLocationId
                    ? locationMap.get(tx.destinationLocationId)
                    : tx.sourceLocationId
                      ? locationMap.get(tx.sourceLocationId)
                      : null;

                  const isPositive = [
                    "Receipt",
                    "Return",
                    "Production",
                    "InitialStock",
                  ].includes(tx.transactionType);

                  return (
                    <tr key={tx.id} className="hover:bg-muted/20">
                      <td className="px-6 py-3.5 text-xs text-muted-foreground font-mono">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                            tx.transactionType === "Receipt"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : tx.transactionType === "Issue"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                          }`}
                        >
                          {tx.transactionType}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-xs font-bold">
                        <span
                          className={
                            isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                          }
                        >
                          {isPositive ? "+" : ""}
                          {tx.quantity} {tx.unitOfMeasure || component.unit}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-foreground font-mono">
                        {targetLoc
                          ? `${targetLoc.code} (${targetLoc.name})`
                          : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <div className="font-mono text-foreground font-medium">
                          {tx.reference || "—"}
                        </div>
                        {tx.reason && (
                          <div className="text-[11px] text-muted-foreground">
                            {tx.reason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground">
                        {tx.createdBy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground italic">
            No inventory transactions recorded for this component yet.
          </div>
        )}
      </div>

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Component"
        description={`Update component "${component.sku}" using the standardized dialog composition.`}
        size="sm"
      >
        <ComponentForm
          initialData={component}
          onSuccess={(updated) => {
            setComponent(updated);
            setIsEditOpen(false);
            setToastMessage(`Component "${updated.sku}" updated successfully.`);
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Component"
        description={`Are you sure you want to delete component "${component.sku}" (${component.name})? This action cannot be undone.`}
        confirmText="Delete Component"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
