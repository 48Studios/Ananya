"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  User,
  X,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { WarehouseTransferForm } from "@/components/warehouse-transfers/warehouse-transfer-form";
import {
  warehouseTransfersApi,
  type WarehouseTransferDto,
  type WarehouseTransferStatus,
} from "@/lib/api/warehouse-transfers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
} from "@/lib/api/inventory-transactions-api";

function getStatusBadge(status: WarehouseTransferStatus) {
  switch (status) {
    case "RECEIVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          RECEIVED
        </span>
      );
    case "DISPATCHED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <Truck className="w-3 h-3 mr-1" />
          DISPATCHED / IN TRANSIT
        </span>
      );
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Send className="w-3 h-3 mr-1" />
          SUBMITTED
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          DRAFT
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          CANCELLED
        </span>
      );
  }
}

export default function ViewWarehouseTransferPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [transfer, setTransfer] = React.useState<WarehouseTransferDto | null>(
    null,
  );
  const [sourceLocation, setSourceLocation] =
    React.useState<LocationDto | null>(null);
  const [destLocation, setDestLocation] = React.useState<LocationDto | null>(
    null,
  );
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [linkedTransactions, setLinkedTransactions] = React.useState<
    InventoryTransactionDto[]
  >([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDispatching, setIsDispatching] = React.useState(false);
  const [isReceiving, setIsReceiving] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [showSubmitDialog, setShowSubmitDialog] = React.useState(false);
  const [showDispatchDialog, setShowDispatchDialog] = React.useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await warehouseTransfersApi.getById(id);
      setTransfer(data);

      const [srcLoc, dstLoc, comps, txs] = await Promise.all([
        locationsApi.getById(data.sourceLocationId).catch(() => null),
        locationsApi.getById(data.destinationLocationId).catch(() => null),
        componentsApi.getAll().catch(() => []),
        inventoryTransactionsApi.getAll().catch(() => []),
      ]);

      if (srcLoc) setSourceLocation(srcLoc);
      if (dstLoc) setDestLocation(dstLoc);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);

      const transferTxs = txs.filter(
        (t) => t.reference === data.transferNumber,
      );
      setLinkedTransactions(transferTxs);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load Warehouse Transfer details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!transfer) return;
    setIsSubmitting(true);
    try {
      const updated = await warehouseTransfersApi.submit(transfer.id);
      setTransfer(updated);
      setShowSubmitDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to submit transfer",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatch = async () => {
    if (!transfer) return;
    setIsDispatching(true);
    try {
      const updated = await warehouseTransfersApi.dispatch(transfer.id);
      setTransfer(updated);
      setShowDispatchDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to dispatch transfer",
      );
    } finally {
      setIsDispatching(false);
    }
  };

  const handleReceive = async () => {
    if (!transfer) return;
    setIsReceiving(true);
    try {
      const updated = await warehouseTransfersApi.receive(transfer.id);
      setTransfer(updated);
      setShowReceiveDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to receive transfer",
      );
    } finally {
      setIsReceiving(false);
    }
  };

  const handleCancel = async () => {
    if (!transfer) return;
    setIsCancelling(true);
    try {
      const updated = await warehouseTransfersApi.cancel(transfer.id);
      setTransfer(updated);
      setShowCancelDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel transfer",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!transfer) return;
    setIsDeleting(true);
    try {
      await warehouseTransfersApi.delete(transfer.id);
      router.push("/warehouse-transfers");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete transfer",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading Warehouse Transfer details..." />;
  }

  if (error || !transfer) {
    return (
      <ErrorState
        title="Transfer Not Found"
        message={
          error || "The requested Warehouse Transfer record does not exist."
        }
        onRetry={fetchData}
      />
    );
  }

  const totalItemCount = transfer.lines.length;
  const totalQuantity = transfer.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={transfer.transferNumber}
        description={`Stock Movement: ${sourceLocation ? sourceLocation.name : transfer.sourceLocationId} → ${destLocation ? destLocation.name : transfer.destinationLocationId}`}
        breadcrumbs={[
          { label: "Warehouse Transfers", href: "/warehouse-transfers" },
          { label: transfer.transferNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/warehouse-transfers")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Order
            </Button>

            {transfer.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setShowSubmitDialog(true)}>
                  <Send className="w-4 h-4 mr-1.5" />
                  Submit Transfer
                </Button>
              </>
            )}

            {transfer.status === "SUBMITTED" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setShowDispatchDialog(true)}>
                  <Truck className="w-4 h-4 mr-1.5" />
                  Dispatch Stock
                </Button>
              </>
            )}

            {transfer.status === "DISPATCHED" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowReceiveDialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Receive & Verify Stock
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                Edit Draft Warehouse Transfer
              </h2>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <WarehouseTransferForm
              initialData={transfer}
              onSuccess={(updated) => {
                setTransfer(updated);
                setIsEditOpen(false);
                fetchData();
              }}
              onCancel={() => setIsEditOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Line Items"
          value={`${totalItemCount} items`}
          subtitle="Component lines"
          icon={Layers}
        />
        <StatCard
          title="Total Transfer Qty"
          value={`${totalQuantity} units`}
          subtitle="Stock movement total"
          icon={Truck}
        />
        <StatCard
          title="Source Location"
          value={sourceLocation?.code || transfer.sourceLocationId}
          subtitle={sourceLocation?.name || "Dispatch Warehouse"}
          icon={MapPin}
        />
        <StatCard
          title="Destination Location"
          value={destLocation?.code || transfer.destinationLocationId}
          subtitle={destLocation?.name || "Receiving Warehouse"}
          icon={MapPin}
        />
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Warehouse Transfer Details
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inter-facility stock movement & dispatch schedule.
              </p>
            </div>
            <div>{getStatusBadge(transfer.status)}</div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Transfer Number
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {transfer.transferNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Source Dispatch Location
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {sourceLocation ? (
                  <Link
                    href={`/locations/${sourceLocation.id}`}
                    className="hover:underline flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {sourceLocation.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({sourceLocation.code})
                    </span>
                  </Link>
                ) : (
                  transfer.sourceLocationId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Destination Receiving Location
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {destLocation ? (
                  <Link
                    href={`/locations/${destLocation.id}`}
                    className="hover:underline flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {destLocation.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({destLocation.code})
                    </span>
                  </Link>
                ) : (
                  transfer.destinationLocationId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Requested Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {transfer.requestedDate
                  ? new Date(transfer.requestedDate).toLocaleDateString()
                  : "Not set"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Dispatch Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                {transfer.dispatchedAt
                  ? new Date(transfer.dispatchedAt).toLocaleString()
                  : "In transit / pending"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Receipt Completion Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                {transfer.receivedAt
                  ? new Date(transfer.receivedAt).toLocaleString()
                  : "Pending receipt"}
              </dd>
            </div>
          </dl>

          {transfer.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Transfer Instructions / Notes
              </span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {transfer.notes}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              Requested By: {transfer.requestedBy || "SYSTEM"}
            </span>
            <span>
              Created: {new Date(transfer.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Lifecycle Flow Timeline Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">
            Lifecycle Stage
          </h3>

          <div className="space-y-4 pt-2">
            {/* Step 1: Draft */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-slate-500/20 text-slate-700 dark:text-slate-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                1
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Draft Created
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Line items prepared
                </p>
              </div>
            </div>

            {/* Step 2: Submitted */}
            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  ["SUBMITTED", "DISPATCHED", "RECEIVED"].includes(
                    transfer.status,
                  )
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                2
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Submitted
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Pending stock dispatch
                </p>
              </div>
            </div>

            {/* Step 3: Dispatched */}
            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  ["DISPATCHED", "RECEIVED"].includes(transfer.status)
                    ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                3
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Dispatched (In Transit)
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Outbound ledger posted
                </p>
              </div>
            </div>

            {/* Step 4: Received */}
            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  transfer.status === "RECEIVED"
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                4
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Received & Completed
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Inbound ledger verified
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Line Items Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Transfer Line Items ({transfer.lines.length} Component Lines)
        </h3>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Component Item</th>
                <th className="p-3 text-right">Transfer Quantity</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Line Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfer.lines.map((line, idx) => {
                const comp = componentsMap[line.componentId];
                return (
                  <tr
                    key={line.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 text-muted-foreground font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-medium">
                      {comp ? (
                        <Link
                          href={`/components/${comp.id}`}
                          className="text-foreground hover:underline"
                        >
                          {comp.name}{" "}
                          <span className="font-mono text-muted-foreground text-[11px]">
                            ({comp.sku})
                          </span>
                        </Link>
                      ) : (
                        <span className="font-mono">{line.componentId}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {line.quantity}
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">
                      {line.unitOfMeasure}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {line.notes || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked Inventory Transactions Audit Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Inventory Ledger Audit Log ({linkedTransactions.length} Posted
            Entries)
          </h3>
          <Link
            href="/transactions"
            className="text-xs text-primary hover:underline font-medium"
          >
            View Ledger →
          </Link>
        </div>

        {linkedTransactions.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 bg-muted/20 border border-border rounded-lg text-center">
            No inventory transactions posted yet. Outbound transactions post on
            dispatch, and inbound transactions post on receipt.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Component</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linkedTransactions.map((tx) => {
                  const comp = componentsMap[tx.componentId];
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3">
                        <span className="font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                          {tx.transactionType}
                        </span>
                      </td>
                      <td className="p-3 font-medium">
                        {comp ? comp.name : tx.componentId}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {tx.sourceLocationId ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            -{tx.quantity}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{tx.quantity}
                          </span>
                        )}{" "}
                        {tx.unitOfMeasure}
                      </td>
                      <td className="p-3 text-muted-foreground">{tx.reason}</td>
                      <td className="p-3 text-right text-muted-foreground font-mono">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showSubmitDialog}
        title="Submit Warehouse Transfer"
        description={`Are you sure you want to submit Transfer "${transfer.transferNumber}" for dispatch authorization?`}
        confirmText="Submit Transfer"
        loading={isSubmitting}
        variant="default"
        onConfirm={handleSubmit}
        onCancel={() => setShowSubmitDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDispatchDialog}
        title="Dispatch Stock Items"
        description={`Are you sure you want to dispatch stock for Transfer "${transfer.transferNumber}"? This will create outbound inventory ledger entries from source location "${sourceLocation?.name || transfer.sourceLocationId}".`}
        confirmText="Dispatch Stock"
        loading={isDispatching}
        variant="default"
        onConfirm={handleDispatch}
        onCancel={() => setShowDispatchDialog(false)}
      />

      <ConfirmDialog
        isOpen={showReceiveDialog}
        title="Receive & Verify Stock Items"
        description={`Are you sure you want to receive stock for Transfer "${transfer.transferNumber}"? This will create inbound inventory ledger entries to destination location "${destLocation?.name || transfer.destinationLocationId}".`}
        confirmText="Receive & Complete"
        loading={isReceiving}
        variant="default"
        onConfirm={handleReceive}
        onCancel={() => setShowReceiveDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Transfer Order"
        description={`Are you sure you want to cancel Transfer "${transfer.transferNumber}"? If stock has already been dispatched, a compensating return entry will be created.`}
        confirmText="Cancel Transfer"
        loading={isCancelling}
        variant="destructive"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Draft Transfer"
        description={`Are you sure you want to permanently delete draft Transfer "${transfer.transferNumber}"?`}
        confirmText="Delete Transfer"
        loading={isDeleting}
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
