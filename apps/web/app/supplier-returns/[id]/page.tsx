"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  Undo2,
  Building2,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  Plus,
  Trash2,
  RotateCcw,
  Loader2,
  AlertTriangle,
  MapPin,
  Package,
  Layers,
  Send,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  buildReturnComponentOptions,
  buildReturnLocationOptions,
  calculateReturnQuantityCeiling,
  findPoLineForComponent,
  validateReturnQuantity,
} from "@/components/supplier-returns/supplier-return-lines.helpers";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  supplierReturnsApi,
  type SupplierReturnDto,
  type SupplierReturnStatus,
} from "@/lib/api/supplier-returns-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";
import { formatCurrency, formatDate } from "@/lib/utils";

function getStatusBadge(status: SupplierReturnStatus) {
  switch (status) {
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          DRAFT
        </span>
      );
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          APPROVED
        </span>
      );
    case "DISPATCHED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
          <Truck className="w-3 h-3 mr-1" />
          DISPATCHED
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          COMPLETED
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          CANCELLED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          {status}
        </span>
      );
  }
}

export default function SupplierReturnDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [returnDoc, setReturnDoc] = React.useState<SupplierReturnDto | null>(null);
  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null);
  const [purchaseOrder, setPurchaseOrder] = React.useState<PurchaseOrderDto | null>(null);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Action dialog states
  const [actionLoading, setActionLoading] = React.useState(false);
  const [showAddLineModal, setShowAddLineModal] = React.useState(false);
  const [showApproveModal, setShowApproveModal] = React.useState(false);
  const [showDispatchModal, setShowDispatchModal] = React.useState(false);
  const [showCompleteModal, setShowCompleteModal] = React.useState(false);
  const [showCancelModal, setShowCancelModal] = React.useState(false);

  // RMA update state
  const [rmaInput, setRmaInput] = React.useState("");

  // Add line form state
  const [selectedComponentId, setSelectedComponentId] = React.useState("");
  const [selectedLocationId, setSelectedLocationId] = React.useState("");
  const [quantityInput, setQuantityInput] = React.useState("");
  const [unitPriceInput, setUnitPriceInput] = React.useState("");
  const [reasonInput, setReasonInput] = React.useState("Defective on arrival");
  const [batchInput, setBatchInput] = React.useState("");
  const [lineError, setLineError] = React.useState<string | null>(null);
  const [componentStockMap, setComponentStockMap] = React.useState<Record<string, number>>({});

  const notify = (message: string, type: "success" | "error" = "success") => {
    setActionNotice({ message, type });
    setTimeout(() => {
      setActionNotice((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await supplierReturnsApi.getById(id);
      setReturnDoc(data);
      setRmaInput(data.rmaNumber || "");

      const [sups, pos, comps, locs] = await Promise.all([
        suppliersApi.getAll().catch(() => []),
        purchaseOrdersApi.getAll().catch(() => []),
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);

      setComponents(comps);
      setLocations(locs);

      const foundSup = sups.find((s: SupplierDto) => s.id === data.supplierId);
      if (foundSup) setSupplier(foundSup);

      if (data.purchaseOrderId) {
        try {
          const detailedPo = await purchaseOrdersApi.getById(data.purchaseOrderId);
          if (detailedPo) setPurchaseOrder(detailedPo);
        } catch {
          const foundPo = pos.find((p: PurchaseOrderDto) => p.id === data.purchaseOrderId);
          if (foundPo) setPurchaseOrder(foundPo);
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load supplier return details",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // When selectedComponentId changes, fetch stock projections for this component
  React.useEffect(() => {
    if (!selectedComponentId) {
      setComponentStockMap({});
      return;
    }
    let isCurrent = true;
    inventoryProjectionsApi
      .getByComponent(selectedComponentId)
      .then((projs: InventoryProjectionDto[]) => {
        if (!isCurrent) return;
        const map: Record<string, number> = {};
        for (const p of projs) {
          map[p.locationId] = p.quantity || 0;
        }
        setComponentStockMap(map);
      })
      .catch(() => {
        if (isCurrent) setComponentStockMap({});
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedComponentId]);

  // Lookup maps
  const componentsMap = React.useMemo(() => {
    const map: Record<string, ComponentDto> = {};
    for (const c of components) map[c.id] = c;
    return map;
  }, [components]);

  const locationsMap = React.useMemo(() => {
    const map: Record<string, LocationDto> = {};
    for (const l of locations) map[l.id] = l;
    return map;
  }, [locations]);

  // Available stock for currently selected component and location in Add Line modal
  const availableStockForSelected = React.useMemo(() => {
    if (!selectedComponentId || !selectedLocationId) return null;
    return componentStockMap[selectedLocationId] ?? 0;
  }, [selectedComponentId, selectedLocationId, componentStockMap]);

  // Selected PO line for the currently chosen component
  const selectedPoLine = React.useMemo(() => {
    return findPoLineForComponent(selectedComponentId, purchaseOrder);
  }, [selectedComponentId, purchaseOrder]);

  // Component options for Add Line: strictly restricted to Purchase Order line items when PO is linked
  const componentOptions = React.useMemo<SearchableSelectOption[]>(() => {
    return buildReturnComponentOptions(components, purchaseOrder);
  }, [components, purchaseOrder]);

  // Location options for Add Line: strictly restricted to locations holding stock > 0 for this component
  const locationOptions = React.useMemo<SearchableSelectOption[]>(() => {
    return buildReturnLocationOptions(
      locations,
      selectedComponentId,
      componentStockMap,
    );
  }, [locations, selectedComponentId, componentStockMap]);

  // Automatically deselect location if newly selected component has no stock at that location
  React.useEffect(() => {
    if (selectedLocationId && selectedComponentId) {
      const stock = componentStockMap[selectedLocationId] ?? 0;
      if (stock <= 0) {
        setSelectedLocationId("");
      }
    }
  }, [selectedComponentId, selectedLocationId, componentStockMap]);

  // Calculate maximum return quantity ceiling combining PO quantity and physical location stock
  const effectiveMaxQuantity = React.useMemo(() => {
    return calculateReturnQuantityCeiling(
      selectedPoLine?.quantityOrdered,
      availableStockForSelected,
    );
  }, [selectedPoLine, availableStockForSelected]);

  const handleComponentSelect = (componentId: string) => {
    setSelectedComponentId(componentId);
    setLineError(null);
    const poLine = findPoLineForComponent(componentId, purchaseOrder);
    if (poLine) {
      setUnitPriceInput(String(poLine.unitPrice));
    } else {
      setUnitPriceInput("");
    }
  };

  const openAddLineModal = () => {
    setSelectedComponentId("");
    setSelectedLocationId("");
    setQuantityInput("");
    setUnitPriceInput("");
    setReasonInput("Defective on arrival");
    setBatchInput("");
    setLineError(null);
    setShowAddLineModal(true);
  };

  // Handlers
  const handleApprove = async () => {
    if (!returnDoc) return;
    setActionLoading(true);
    try {
      const updated = await supplierReturnsApi.approve(
        returnDoc.id,
        rmaInput.trim() || undefined,
      );
      setReturnDoc(updated);
      setShowApproveModal(false);
      notify("Supplier return approved successfully.", "success");
      await loadData();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to approve return.",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatch = async () => {
    if (!returnDoc) return;
    setActionLoading(true);
    try {
      const updated = await supplierReturnsApi.dispatch(returnDoc.id);
      setReturnDoc(updated);
      setShowDispatchModal(false);
      notify(
        `Supplier return dispatched! Inventory stock has been deducted from respective warehouse locations.`,
        "success",
      );
      await loadData();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to dispatch return.",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!returnDoc) return;
    setActionLoading(true);
    try {
      const updated = await supplierReturnsApi.complete(returnDoc.id);
      setReturnDoc(updated);
      setShowCompleteModal(false);
      notify(
        "Supplier return marked as completed / credited.",
        "success",
      );
      await loadData();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to complete return.",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!returnDoc) return;
    setActionLoading(true);
    try {
      const updated = await supplierReturnsApi.cancel(returnDoc.id);
      setReturnDoc(updated);
      setShowCancelModal(false);
      notify(
        returnDoc.status === "DISPATCHED"
          ? "Supplier return cancelled! Deducted stock has been safely restored to warehouse locations."
          : "Supplier return cancelled.",
        "success",
      );
      await loadData();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to cancel return.",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLineError(null);

    if (!selectedComponentId) {
      setLineError("Please select a component.");
      return;
    }
    if (!selectedLocationId) {
      setLineError("Please select a storage location holding stock.");
      return;
    }
    const qty = parseFloat(quantityInput);
    const qtyValidationError = validateReturnQuantity(
      qty,
      selectedPoLine?.quantityOrdered,
      availableStockForSelected,
    );
    if (qtyValidationError) {
      setLineError(qtyValidationError);
      return;
    }

    const price = selectedPoLine
      ? selectedPoLine.unitPrice
      : parseFloat(unitPriceInput);
    if (isNaN(price) || price < 0) {
      setLineError("Please enter a valid unit price.");
      return;
    }

    setActionLoading(true);
    try {
      const updated = await supplierReturnsApi.addLine(id, {
        componentId: selectedComponentId,
        locationId: selectedLocationId,
        quantityReturned: qty,
        unitPrice: price,
        reason: reasonInput.trim() || "Defective on arrival",
        batchNumber: batchInput.trim() || undefined,
      });

      setReturnDoc(updated);
      setShowAddLineModal(false);
      setSelectedComponentId("");
      setSelectedLocationId("");
      setQuantityInput("");
      setUnitPriceInput("");
      setBatchInput("");
      notify("Line item added to return.", "success");
      await loadData();
    } catch (err: unknown) {
      setLineError(
        err instanceof Error ? err.message : "Failed to add line item.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveLine = async (lineId: string) => {
    if (!confirm("Are you sure you want to remove this line item?")) return;
    setActionLoading(true);
    try {
      const updated = await supplierReturnsApi.removeLine(id, lineId);
      setReturnDoc(updated);
      notify("Line item removed.", "success");
      await loadData();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to remove line item.",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading supplier return details..." />;
  }

  if (error || !returnDoc) {
    return (
      <ErrorState
        title="Error Loading Return"
        message={error || "Supplier return not found."}
        onRetry={loadData}
      />
    );
  }

  const lines = returnDoc.lines || [];
  const totalQtyReturned = lines.reduce((acc, l) => acc + (l.quantityReturned || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={returnDoc.returnNumber}
        description={`Supplier Material Return & Debit Memo Authorization • Status: ${returnDoc.status}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Status Selector */}
            <Select
              value={returnDoc.status}
              onValueChange={async (newVal: string | null) => {
                if (!newVal || newVal === returnDoc.status) return;
                if (newVal === "APPROVED") {
                  setShowApproveModal(true);
                } else if (newVal === "DISPATCHED") {
                  setShowDispatchModal(true);
                } else if (newVal === "COMPLETED") {
                  setShowCompleteModal(true);
                } else if (newVal === "CANCELLED") {
                  setShowCancelModal(true);
                } else {
                  try {
                    setActionLoading(true);
                    const updated = await supplierReturnsApi.updateStatus(id, {
                      status: newVal,
                    });
                    setReturnDoc(updated);
                    notify(`Status updated to ${newVal}`, "success");
                    await loadData();
                  } catch (err: unknown) {
                    notify(
                      err instanceof Error
                        ? err.message
                        : "Failed to update status",
                      "error",
                    );
                  } finally {
                    setActionLoading(false);
                  }
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="DRAFT"
                  disabled={
                    returnDoc.status === "DISPATCHED" ||
                    returnDoc.status === "COMPLETED"
                  }
                >
                  Draft
                </SelectItem>
                <SelectItem
                  value="APPROVED"
                  disabled={
                    lines.length === 0 ||
                    returnDoc.status === "DISPATCHED" ||
                    returnDoc.status === "COMPLETED"
                  }
                >
                  Approved
                </SelectItem>
                <SelectItem
                  value="DISPATCHED"
                  disabled={
                    lines.length === 0 || returnDoc.status === "COMPLETED"
                  }
                >
                  Dispatched
                </SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem
                  value="CANCELLED"
                  disabled={returnDoc.status === "COMPLETED"}
                >
                  Cancelled
                </SelectItem>
              </SelectContent>
            </Select>
            
            {/* Status Workflow Actions */}
            {returnDoc.status === "DRAFT" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddLineModal(true)}
                  disabled={actionLoading}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Line Item
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowApproveModal(true)}
                  disabled={actionLoading || lines.length === 0}
                  title={
                    lines.length === 0
                      ? "Add at least one line item before approving"
                      : undefined
                  }
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Approve Return
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
              </>
            )}

            {returnDoc.status === "APPROVED" && (
              <>
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => setShowDispatchModal(true)}
                  disabled={actionLoading}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Dispatch & Deduct Stock
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
              </>
            )}

            {returnDoc.status === "DISPATCHED" && (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setShowCompleteModal(true)}
                  disabled={actionLoading}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Mark as Credited / Completed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Cancel & Restore Stock
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Notice Banner */}
      {actionNotice && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between transition-all duration-300 ${
            actionNotice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {actionNotice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <span>{actionNotice.message}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActionNotice(null)}
            className="h-6 w-6 text-muted-foreground hover:text-foreground -mr-1"
          >
            <span className="sr-only">Dismiss</span>
            &times;
          </Button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Return Valuation"
          value={formatCurrency(returnDoc.totalAmount || 0)}
          subtitle="Total credit amount"
          icon={Undo2}
        />
        <StatCard
          title="Line Items"
          value={lines.length.toString()}
          subtitle={`${totalQtyReturned} total units returned`}
          icon={Package}
        />
        <StatCard
          title="Target Supplier"
          value={supplier?.name || "Supplier"}
          subtitle={supplier?.code ? `Code: ${supplier.code}` : "Vendor reference"}
          icon={Building2}
        />
        <StatCard
          title="Purchase Order Ref"
          value={purchaseOrder?.poNumber || returnDoc.poNumber || "None / Direct"}
          subtitle={returnDoc.rmaNumber ? `RMA: ${returnDoc.rmaNumber}` : "No RMA assigned"}
          icon={FileText}
        />
      </div>

      {/* Overview Metadata Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Return Specifications & Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Return Number:</span>
            <p className="font-mono font-bold text-foreground mt-0.5">
              {returnDoc.returnNumber}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Supplier:</span>
            <p className="font-medium text-foreground mt-0.5">
              {supplier?.name || returnDoc.supplierName || returnDoc.supplierId}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Associated Purchase Order:</span>
            <p className="font-mono font-medium text-foreground mt-0.5">
              {purchaseOrder?.poNumber || returnDoc.poNumber || "None"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Supplier RMA #:</span>
            <p className="font-mono font-medium text-foreground mt-0.5">
              {returnDoc.rmaNumber || <span className="italic text-muted-foreground">Not provided</span>}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Creation Date:</span>
            <p className="text-foreground mt-0.5">
              {returnDoc.createdAt ? formatDate(returnDoc.createdAt) : "-"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Dispatched Date:</span>
            <p className="text-foreground mt-0.5">
              {returnDoc.dispatchedAt ? formatDate(returnDoc.dispatchedAt) : "-"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Current Status:</span>
            <div className="mt-0.5">{getStatusBadge(returnDoc.status)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Inventory Impact:</span>
            <p className="text-foreground mt-0.5">
              {returnDoc.status === "DISPATCHED" || returnDoc.status === "COMPLETED" ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Stock Deducted ({totalQtyReturned} units)
                </span>
              ) : returnDoc.status === "CANCELLED" ? (
                <span className="text-muted-foreground">None (Cancelled)</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Pending Dispatch
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-2xs space-y-0">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Returned Component Line Items ({lines.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Components returned to vendor with storage location and unit valuation.
            </p>
          </div>
          {returnDoc.status === "DRAFT" && (
            <Button size="sm" onClick={openAddLineModal}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Component Line
            </Button>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <Package className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">
              No component lines added yet
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add the defective, overstock, or non-conforming items to be returned to this supplier.
            </p>
            {returnDoc.status === "DRAFT" && (
              <Button
                size="sm"
                variant="outline"
                onClick={openAddLineModal}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add First Component
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">Component</th>
                  <th className="py-3 px-4">Return Location</th>
                  <th className="py-3 px-4 text-right">Return Qty</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Line Total</th>
                  <th className="py-3 px-4">Reason / Batch</th>
                  {returnDoc.status === "DRAFT" && (
                    <th className="py-3 px-4 text-right">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => {
                  const comp = componentsMap[line.componentId];
                  const loc = locationsMap[line.locationId];
                  const lineTotal = (line.quantityReturned || 0) * (line.unitPrice || 0);

                  return (
                    <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground">
                          {comp?.name || line.componentId}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {comp?.sku || line.componentId}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{loc?.name || line.locationId}</span>
                        </div>
                        {loc?.code && (
                          <div className="text-[10px] font-mono text-muted-foreground pl-4">
                            ({loc.code})
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold text-foreground">
                        {line.quantityReturned}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono text-foreground">
                        {formatCurrency(line.unitPrice || 0)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold text-foreground">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">
                          {line.reason || "Defective on arrival"}
                        </div>
                        {line.batchNumber && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            Batch: {line.batchNumber}
                          </div>
                        )}
                      </td>
                      {returnDoc.status === "DRAFT" && (
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveLine(line.id)}
                            title="Remove line item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD LINE ITEM MODAL */}
      {showAddLineModal && (
        <DialogShell
          open={showAddLineModal}
          onOpenChange={setShowAddLineModal}
          title="Add Returned Component Item"
          description="Select the component, source location, and quantity to return to vendor."
          size="md"
        >
          <form onSubmit={handleAddLineSubmit} className="space-y-4">
            <DialogShellBody className="space-y-4">
              {lineError && (
                <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                  {lineError}
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="line-component">
                  Component <span className="text-destructive">*</span>
                </FieldLabel>
                <SearchableSelect
                  id="line-component"
                  placeholder={
                    purchaseOrder?.lines && purchaseOrder.lines.length > 0
                      ? "Select item from Purchase Order..."
                      : "Select a component..."
                  }
                  searchPlaceholder="Search component by name or SKU..."
                  value={selectedComponentId}
                  onValueChange={handleComponentSelect}
                  options={componentOptions}
                />
                {purchaseOrder && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Showing items associated with Purchase Order{" "}
                    <strong className="text-foreground font-mono">
                      {purchaseOrder.poNumber}
                    </strong>
                    .
                  </p>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="line-location">
                  Source Storage Location <span className="text-destructive">*</span>
                </FieldLabel>
                <SearchableSelect
                  id="line-location"
                  placeholder={
                    !selectedComponentId
                      ? "Select a component first..."
                      : locationOptions.length === 0
                      ? "No location holds stock..."
                      : "Select storage location holding stock..."
                  }
                  searchPlaceholder="Search storage location..."
                  value={selectedLocationId}
                  onValueChange={setSelectedLocationId}
                  options={locationOptions}
                  disabled={!selectedComponentId || locationOptions.length === 0}
                />
                {selectedComponentId && locationOptions.length === 0 && (
                  <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      No warehouse location currently holds stock for this component (0 available in inventory).
                    </span>
                  </div>
                )}
                {availableStockForSelected !== null && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Available stock at selected location:{" "}
                    <strong className="text-foreground font-mono">
                      {availableStockForSelected}
                    </strong>{" "}
                    units
                  </p>
                )}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="line-qty">
                    Return Quantity <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="line-qty"
                    type="number"
                    step="any"
                    min="1"
                    max={effectiveMaxQuantity}
                    placeholder="e.g. 5"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground mt-1.5">
                    {selectedPoLine && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">
                        PO Ordered: {selectedPoLine.quantityOrdered}
                      </span>
                    )}
                    {availableStockForSelected !== null && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">
                        Location Stock: {availableStockForSelected}
                      </span>
                    )}
                    {effectiveMaxQuantity !== undefined && (
                      <span className="font-semibold text-primary">
                        Max: {effectiveMaxQuantity}
                      </span>
                    )}
                  </div>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="line-price"
                    className="flex items-center justify-between"
                  >
                    <span>
                      Unit Price ({supplier?.currency || "INR"}){" "}
                      <span className="text-destructive">*</span>
                    </span>
                    {selectedPoLine && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                        <Lock className="w-2.5 h-2.5" />
                        PO Locked
                      </span>
                    )}
                  </FieldLabel>
                  <Input
                    id="line-price"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 250.00"
                    value={unitPriceInput}
                    readOnly={Boolean(selectedPoLine)}
                    className={
                      selectedPoLine
                        ? "bg-muted cursor-not-allowed opacity-90"
                        : ""
                    }
                    onChange={(e) => {
                      if (!selectedPoLine) {
                        setUnitPriceInput(e.target.value);
                      }
                    }}
                  />
                  {selectedPoLine ? (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span>
                        Autofilled from Purchase Order (
                        {formatCurrency(selectedPoLine.unitPrice)}/unit).
                      </span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Enter unit price for vendor credit.
                    </p>
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="line-reason">Reason for Return</FieldLabel>
                  <Input
                    id="line-reason"
                    placeholder="e.g. Defective on arrival, Out of spec"
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="line-batch">Batch / Lot #</FieldLabel>
                  <Input
                    id="line-batch"
                    placeholder="e.g. LOT-2026-X1"
                    value={batchInput}
                    onChange={(e) => setBatchInput(e.target.value)}
                  />
                </Field>
              </div>
            </DialogShellBody>
            <DialogShellFooter>
              <DialogShellCancelButton
                disabled={actionLoading}
                onClick={() => setShowAddLineModal(false)}
              />
              <Button
                size="sm"
                type="submit"
                disabled={
                  actionLoading ||
                  !selectedComponentId ||
                  !selectedLocationId ||
                  (availableStockForSelected !== null &&
                    availableStockForSelected <= 0)
                }
              >
                {actionLoading && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Add Item
              </Button>
            </DialogShellFooter>
          </form>
        </DialogShell>
      )}

      {/* APPROVE RETURN MODAL */}
      {showApproveModal && (
        <DialogShell
          open={showApproveModal}
          onOpenChange={setShowApproveModal}
          title="Approve Supplier Return"
          description="Confirm approval of this vendor return before dispatch."
          size="sm"
        >
          <DialogShellBody className="space-y-4">
            <p className="text-xs text-foreground">
              You are approving return <strong>{returnDoc.returnNumber}</strong> containing{" "}
              <strong>{lines.length}</strong> component line item(s) valued at{" "}
              <strong>{formatCurrency(returnDoc.totalAmount || 0)}</strong>.
            </p>

            <Field>
              <FieldLabel htmlFor="approve-rma">
                Supplier RMA # (Optional)
              </FieldLabel>
              <Input
                id="approve-rma"
                placeholder="e.g. VENDOR-RMA-889"
                value={rmaInput}
                onChange={(e) => setRmaInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Assign vendor Return Merchandise Authorization reference if received.
              </p>
            </Field>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton
              disabled={actionLoading}
              onClick={() => setShowApproveModal(false)}
            />
            <Button size="sm" onClick={handleApprove} disabled={actionLoading}>
              {actionLoading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Confirm Approval
            </Button>
          </DialogShellFooter>
        </DialogShell>
      )}

      {/* DISPATCH & DEDUCT STOCK MODAL */}
      {showDispatchModal && (
        <DialogShell
          open={showDispatchModal}
          onOpenChange={setShowDispatchModal}
          title="Dispatch Supplier Return & Deduct Stock"
          description="Log inventory issue transactions and deduct returned components from storage locations."
          size="md"
        >
          <DialogShellBody className="space-y-4">
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2 text-xs text-indigo-800 dark:text-indigo-300">
              <div className="flex items-center gap-1.5 font-semibold">
                <Truck className="w-4 h-4 shrink-0" />
                <span>Physical Inventory Deduction</span>
              </div>
              <p>
                Dispatching will record <strong>Issue</strong> inventory transactions for each of the{" "}
                <strong>{lines.length}</strong> component lines. Physical stock will be deducted from your warehouse storage locations and inventory projections will be automatically updated.
              </p>
            </div>

            <div className="border border-border rounded-lg p-3 space-y-2 text-xs">
              <span className="font-semibold text-foreground">Items to be issued:</span>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                {lines.map((l) => (
                  <li key={l.id}>
                    <strong>{l.quantityReturned}x</strong> {componentsMap[l.componentId]?.name || l.componentId} from{" "}
                    {locationsMap[l.locationId]?.name || l.locationId}
                  </li>
                ))}
              </ul>
            </div>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton
              disabled={actionLoading}
              onClick={() => setShowDispatchModal(false)}
            />
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleDispatch}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              Confirm Dispatch & Issue Stock
            </Button>
          </DialogShellFooter>
        </DialogShell>
      )}

      {/* COMPLETE / CREDIT MODAL */}
      {showCompleteModal && (
        <DialogShell
          open={showCompleteModal}
          onOpenChange={setShowCompleteModal}
          title="Complete Return & Record Vendor Credit"
          description="Confirm vendor credit receipt and finalize this supplier return."
          size="sm"
        >
          <DialogShellBody className="space-y-3 text-xs">
            <p className="text-foreground">
              Finalize <strong>{returnDoc.returnNumber}</strong> as completed. The vendor debit memo is settled and credit has been accounted for.
            </p>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton
              disabled={actionLoading}
              onClick={() => setShowCompleteModal(false)}
            />
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleComplete}
              disabled={actionLoading}
            >
              {actionLoading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Mark Completed
            </Button>
          </DialogShellFooter>
        </DialogShell>
      )}

      {/* CANCEL MODAL */}
      {showCancelModal && (
        <DialogShell
          open={showCancelModal}
          onOpenChange={setShowCancelModal}
          title="Cancel Supplier Return"
          description="Cancel this return document and reverse inventory impact if already dispatched."
          size="md"
        >
          <DialogShellBody className="space-y-3 text-xs">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Confirm Cancellation</span>
              </div>
              <p className="mt-1">
                {returnDoc.status === "DISPATCHED" ? (
                  <>
                    This return was already dispatched. Cancelling will log <strong>Receipt</strong> transactions restoring all{" "}
                    <strong>{totalQtyReturned}</strong> units back into warehouse stock locations.
                  </>
                ) : (
                  <>
                    Are you sure you want to cancel return <strong>{returnDoc.returnNumber}</strong>?
                  </>
                )}
              </p>
            </div>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton
              disabled={actionLoading}
              onClick={() => setShowCancelModal(false)}
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading}
            >
              {actionLoading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Confirm Cancel
            </Button>
          </DialogShellFooter>
        </DialogShell>
      )}
    </div>
  );
}
