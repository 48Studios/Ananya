"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Lock,
  Clock,
  XCircle,
  MapPin,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  User,
  FileText,
  Unlock,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ReservationForm } from "@/components/reservations/reservation-form";
import {
  reservationsApi,
  type ReservationDto,
  type ReservationStatus,
  type ReservationType,
  type AvailableQuantityDto,
} from "@/lib/api/reservations-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getStatusBadge(status: ReservationStatus) {
  switch (status) {
    case "FULFILLED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <PackageCheck className="w-3 h-3 mr-1" />
          FULFILLED & CONSUMED
        </span>
      );
    case "RELEASED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">
          <Unlock className="w-3 h-3 mr-1" />
          RELEASED TO AVAILABLE
        </span>
      );
    case "ACTIVE":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Lock className="w-3 h-3 mr-1" />
          ACTIVE LOCK RESERVATION
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          DRAFT
        </span>
      );
    case "EXPIRED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
          <Clock className="w-3 h-3 mr-1" />
          EXPIRED
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

function getTypeBadge(type: ReservationType) {
  switch (type) {
    case "WORK_ORDER":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-purple-500/10 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
          Work Order
        </span>
      );
    case "PROJECT":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
          Project Stock
        </span>
      );
    case "PURCHASE_REQUEST":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
          Purchase Request
        </span>
      );
    case "SALES_ORDER":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
          Sales Order
        </span>
      );
  }
}

export default function ViewReservationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [reservation, setReservation] = React.useState<ReservationDto | null>(
    null,
  );
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [availabilityMap, setAvailabilityMap] = React.useState<
    Record<string, AvailableQuantityDto>
  >({});

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isFulfilling, setIsFulfilling] = React.useState(false);
  const [isReleasing, setIsReleasing] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [showFulfillDialog, setShowFulfillDialog] = React.useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reservationsApi.getById(id);
      setReservation(data);

      const [comps, locs] = await Promise.all([
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);

      // Fetch availability model for lines
      const availMap: Record<string, AvailableQuantityDto> = {};
      for (const line of data.lines) {
        const key = `${line.componentId}_${line.locationId}`;
        if (!availMap[key]) {
          const avail = await reservationsApi
            .getAvailable(line.componentId, line.locationId)
            .catch(() => null);
          if (avail) availMap[key] = avail;
        }
      }
      setAvailabilityMap(availMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load Reservation details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFulfill = async () => {
    if (!reservation) return;
    setIsFulfilling(true);
    try {
      const updated = await reservationsApi.fulfill(reservation.id);
      setReservation(updated);
      setShowFulfillDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fulfill reservation",
      );
    } finally {
      setIsFulfilling(false);
    }
  };

  const handleRelease = async () => {
    if (!reservation) return;
    setIsReleasing(true);
    try {
      const updated = await reservationsApi.release(reservation.id);
      setReservation(updated);
      setShowReleaseDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to release reservation",
      );
    } finally {
      setIsReleasing(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;
    setIsCancelling(true);
    try {
      const updated = await reservationsApi.cancel(reservation.id);
      setReservation(updated);
      setShowCancelDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel reservation",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!reservation) return;
    setIsDeleting(true);
    try {
      await reservationsApi.delete(reservation.id);
      router.push("/reservations");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete reservation",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading Reservation details..." />;
  }

  if (error || !reservation) {
    return (
      <ErrorState
        title="Reservation Not Found"
        message={
          error || "The requested Inventory Reservation record does not exist."
        }
        onRetry={fetchData}
      />
    );
  }

  const totalReservedItems = reservation.lines.length;
  const totalReservedQuantity = reservation.lines.reduce(
    (sum, l) => sum + l.reservedQuantity,
    0,
  );

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={reservation.reservationNumber}
        description={`Stock Hold Commitment: ${reservation.reservedBy}`}
        breadcrumbs={[
          { label: "Reservations & Allocations", href: "/reservations" },
          { label: reservation.reservationNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/reservations")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report
            </Button>

            {(reservation.status === "DRAFT" ||
              reservation.status === "ACTIVE") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Lines
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </>
            )}

            {reservation.status === "ACTIVE" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel Lock
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReleaseDialog(true)}
                  className="text-sky-700 dark:text-sky-300 border-sky-500/20 hover:bg-sky-500/10"
                >
                  <Unlock className="w-4 h-4 mr-1.5" />
                  Release Reservation
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowFulfillDialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <PackageCheck className="w-4 h-4 mr-1.5" />
                  Fulfill Reservation
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Inventory Reservation"
        description="Update hard-allocation reservation quantity or target order project."
        size="xl"
      >
        <ReservationForm
          initialData={reservation}
          onSuccess={(updated) => {
            setReservation(updated);
            setIsEditOpen(false);
            fetchData();
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Reserved Components"
          value={`${totalReservedItems} items`}
          subtitle="Committed line scope"
          icon={Layers}
        />
        <StatCard
          title="Total Reserved Quantity"
          value={`${totalReservedQuantity} units`}
          subtitle="Locked inventory hold"
          icon={Lock}
        />
        <StatCard
          title="Reservation Type"
          value={reservation.reservationType.replace("_", " ")}
          subtitle={reservation.referenceDocument || "No reference #"}
          icon={FileText}
        />
        <StatCard
          title="Expiration Lock"
          value={
            reservation.expiresAt
              ? new Date(reservation.expiresAt).toLocaleDateString()
              : "Permanent Lock"
          }
          subtitle="Automatic release date"
          icon={Calendar}
        />
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Reservation Specification
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Committed inventory lock & available stock calculation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getTypeBadge(reservation.reservationType)}
              {getStatusBadge(reservation.status)}
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Reservation Number
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {reservation.reservationNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Reference Document #
              </dt>
              <dd className="mt-1 font-mono text-sm font-bold text-foreground">
                {reservation.referenceDocument || "—"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Reserved By
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {reservation.reservedBy}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Expiration Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {reservation.expiresAt
                  ? new Date(reservation.expiresAt).toLocaleDateString()
                  : "No expiry set"}
              </dd>
            </div>
          </dl>

          {reservation.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Allocation Notes & Justification
              </span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {reservation.notes}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Created At: {new Date(reservation.createdAt).toLocaleString()}
            </span>
            <span>
              Last Updated: {new Date(reservation.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Lock Effect Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">
            Stock Allocation Effect
          </h3>

          <div className="p-3.5 bg-muted/30 border border-border rounded-lg space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                On-Hand Stock Impact:
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                UNTOUCHED (0 change)
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                Available Quantity Impact:
              </span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                REDUCED (-{totalReservedQuantity})
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2 leading-relaxed">
              Domain invariant: <code>Available = On Hand - Reserved</code>.
              Stock physical movements occur only upon material fulfillment.
            </p>
          </div>
        </div>
      </div>

      {/* Reserved Items Table with Stock Model Calculation */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Reserved Component Lines & Live Inventory Balances (
          {reservation.lines.length} Items)
        </h3>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Component Item</th>
                <th className="p-3">Location</th>
                <th className="p-3 text-right">On-Hand</th>
                <th className="p-3 text-right">Total Reserved</th>
                <th className="p-3 text-right">Available</th>
                <th className="p-3 text-right">This Lock Qty</th>
                <th className="p-3">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reservation.lines.map((line, idx) => {
                const comp = componentsMap[line.componentId];
                const loc = locationsMap[line.locationId];
                const availKey = `${line.componentId}_${line.locationId}`;
                const avail = availabilityMap[availKey];

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
                    <td className="p-3 font-medium text-foreground">
                      {loc ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          {loc.name}{" "}
                          <span className="font-mono text-muted-foreground text-[11px]">
                            ({loc.code})
                          </span>
                        </span>
                      ) : (
                        line.locationId
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {avail ? avail.onHand : "—"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {avail ? avail.reserved : "—"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {avail ? avail.available : "—"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {line.reservedQuantity}
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">
                      {line.unitOfMeasure}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showFulfillDialog}
        title="Fulfill Inventory Reservation"
        description={`Are you sure you want to fulfill Reservation "${reservation.reservationNumber}"? This indicates the reserved materials have been consumed by reference document "${reservation.referenceDocument || "Work Order"}".`}
        confirmText="Fulfill Reservation"
        loading={isFulfilling}
        variant="default"
        onConfirm={handleFulfill}
        onCancel={() => setShowFulfillDialog(false)}
      />

      <ConfirmDialog
        isOpen={showReleaseDialog}
        title="Release Reserved Inventory"
        description={`Are you sure you want to release Reservation "${reservation.reservationNumber}"? Released inventory immediately returns to Available Quantity. No physical inventory moves.`}
        confirmText="Release Lock"
        loading={isReleasing}
        variant="default"
        onConfirm={handleRelease}
        onCancel={() => setShowReleaseDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Reservation Lock"
        description={`Are you sure you want to cancel Reservation "${reservation.reservationNumber}"?`}
        confirmText="Cancel Reservation"
        loading={isCancelling}
        variant="destructive"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Reservation Record"
        description={`Are you sure you want to permanently delete draft Reservation "${reservation.reservationNumber}"?`}
        confirmText="Delete Reservation"
        loading={isDeleting}
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
