"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
  Info,
  Printer,
  Sliders,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import {
  DetailChip,
  DetailField,
  DetailFields,
  DetailMono,
  DetailMuted,
  DetailText,
} from "@/components/ui/detail-field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  RecordTimestamps,
  SectionCard,
  SectionCardFooter,
} from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { DetailTable } from "@/components/ui/detail-table";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ComponentForm } from "@/components/components/component-form";
import { ManageComponentSpecificationsDialog } from "@/components/components/manage-component-specifications-dialog";
import { DocumentationPanel } from "@/components/documentation/documentation-panel";
import { ComponentSpecificationIntelligenceDialog } from "@/components/documentation/component-specification-intelligence-dialog";
import { PrintLabelDialog } from "@/components/barcodes/print-label-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  COMPONENT_WRITE_PERMISSION,
  DOCUMENT_READ_PERMISSION,
} from "@/lib/document-intelligence";
import {
  describeRunOutcome,
  hasSpecificationIntelligence,
  intelligenceEntryLabel,
  withUpdatedSpecifications,
} from "@/lib/specification-intelligence";
import {
  componentSpecificationApi,
  type ComponentDocumentationStateDto,
  type SpecificationAggregateDto,
} from "@/lib/api/documentation-intelligence-api";
import { cn } from "@/lib/utils";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import {
  manufacturersApi,
  type ManufacturerDto,
} from "@/lib/api/manufacturers-api";
import {
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
} from "@/lib/api/inventory-transactions-api";

/**
 * One component, as a master-data record.
 *
 * The page is ordered the way the record is read: identity, then inventory
 * state, then the definition, then where the stock is, then what moved, then
 * what documents it. Documentation Intelligence is deliberately not one of these
 * sections — it is an analysis/review workflow, so it opens in a dialog from the
 * Documentation header rather than occupying a permanent block on the record.
 */
export default function ViewComponentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { hasPermission } = useAuth();
  const canWrite = hasPermission(COMPONENT_WRITE_PERMISSION);
  const canReadDocuments = hasPermission(DOCUMENT_READ_PERMISSION);

  const [component, setComponent] = React.useState<ComponentDto | null>(null);
  const [defaultLocation, setDefaultLocation] =
    React.useState<LocationDto | null>(null);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [manufacturers, setManufacturers] = React.useState<ManufacturerDto[]>(
    [],
  );
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
  const [isPrintOpen, setIsPrintOpen] = React.useState(false);
  const [isSpecsOpen, setIsSpecsOpen] = React.useState(false);

  // Documentation Intelligence. The stored state is loaded once for the record
  // so the entry point can name it; opening the dialog never re-runs analysis.
  const [isIntelligenceOpen, setIsIntelligenceOpen] = React.useState(false);
  const [intelligenceState, setIntelligenceState] =
    React.useState<ComponentDocumentationStateDto | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = React.useState(false);
  const [intelligenceRunning, setIntelligenceRunning] = React.useState(false);
  const [intelligenceError, setIntelligenceError] = React.useState<
    string | null
  >(null);
  const [intelligenceNotice, setIntelligenceNotice] = React.useState<
    string | null
  >(null);
  /**
   * Whether a decision or application changed the findings.
   *
   * Row state is updated from each mutation's own response, but the summary
   * counts are server-derived and only move on a read. Rather than refetch after
   * every click, the page marks itself dirty and reconciles once, when the modal
   * closes — so the entry point's review count is never stale for long.
   */
  const [intelligenceDirty, setIntelligenceDirty] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [
        comp,
        compProjections,
        compTransactions,
        allLocs,
        allCats,
        allMfgs,
      ] = await Promise.all([
        componentsApi.getById(id),
        inventoryProjectionsApi.getByComponent(id).catch(() => []),
        inventoryTransactionsApi.getAll({ componentId: id }).catch(() => []),
        locationsApi.getAll().catch(() => []),
        categoriesApi.getAll().catch(() => []),
        manufacturersApi.getAll().catch(() => []),
      ]);

      setComponent(comp);
      setProjections(compProjections);
      setTransactions(compTransactions);
      setLocations(allLocs);
      setCategories(allCats);
      setManufacturers(allMfgs);

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

  const categoryMap = React.useMemo(() => {
    const map = new Map<string, CategoryDto>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  const manufacturerMap = React.useMemo(() => {
    const map = new Map<string, ManufacturerDto>();
    for (const mfg of manufacturers) {
      map.set(mfg.id, mfg);
    }
    return map;
  }, [manufacturers]);

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
        } else if (["Issue", "Consumption"].includes(tx.transactionType)) {
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

  /** Locations that actually hold this component, largest balance first. */
  const stockLocations = React.useMemo(
    () =>
      projections
        .filter((projection) => Number(projection.quantity) !== 0)
        .sort((left, right) => Number(right.quantity) - Number(left.quantity)),
    [projections],
  );

  /**
   * Stock exists but no projection accounts for it at a location.
   *
   * Worth calling out explicitly: an empty location table next to a non-zero
   * on-hand total reads as missing data unless the page says why.
   */
  const stockWithoutLocationBreakdown =
    stockLocations.length === 0 && currentStock !== 0;

  const loadIntelligence = React.useCallback(async () => {
    if (!id) return;
    setIntelligenceLoading(true);
    setIntelligenceError(null);
    try {
      setIntelligenceState(await componentSpecificationApi.getState(id));
    } catch (loadError) {
      setIntelligenceState(null);
      setIntelligenceError(
        loadError instanceof Error
          ? loadError.message
          : "Specification intelligence could not be loaded.",
      );
    } finally {
      setIntelligenceLoading(false);
    }
  }, [id]);

  /**
   * Runs the component-level analysis and refreshes from its own response.
   *
   * The response carries the new state, so the modal and the entry point both
   * update without a refetch or a page reload.
   */
  const runIntelligence = React.useCallback(async () => {
    if (!id) return;
    setIntelligenceRunning(true);
    setIntelligenceError(null);
    setIntelligenceNotice(null);
    try {
      const result = await componentSpecificationApi.analyze(id);
      setIntelligenceState((current) => ({
        componentId: id,
        summary: result.summary,
        specifications: result.specifications,
        unmapped: result.unmapped,
        eligibleDocumentIds: current?.eligibleDocumentIds ?? [],
      }));
      setIntelligenceNotice(
        describeRunOutcome({
          documentsAnalyzed: result.summary.documentsAnalyzed,
          createdFindingCount: result.createdFindingCount,
          staledFindingCount: result.staledFindingCount,
        }),
      );
    } catch (runError) {
      setIntelligenceError(
        runError instanceof Error
          ? runError.message
          : "The documentation analysis could not be completed.",
      );
    } finally {
      setIntelligenceRunning(false);
    }
  }, [id]);

  React.useEffect(() => {
    if (!id || !canReadDocuments) return;
    void loadIntelligence();
  }, [id, canReadDocuments, loadIntelligence]);

  /**
   * Opens the intelligence dialog.
   *
   * The analysis only runs when nothing has been analyzed yet. An existing
   * analysis is reopened as-is: the component page never spends an analysis run
   * just because it was loaded.
   */
  const openIntelligence = () => {
    setIsIntelligenceOpen(true);
    setIntelligenceNotice(null);
    setIntelligenceError(null);
    setIntelligenceDirty(false);
    if (
      !intelligenceState ||
      intelligenceState.summary.documentsAnalyzed === 0
    ) {
      void runIntelligence();
    }
  };

  const handleSpecificationsChange = (
    specifications: SpecificationAggregateDto[],
  ) => {
    setIntelligenceState((current) =>
      current ? withUpdatedSpecifications(current, specifications) : current,
    );
    setIntelligenceDirty(true);
  };

  /** Closes the modal, reconciling the server-derived summary if it moved. */
  const closeIntelligence = () => {
    setIsIntelligenceOpen(false);
    if (intelligenceDirty) {
      setIntelligenceDirty(false);
      void loadIntelligence();
    }
  };

  /**
   * Re-reads the component after a write.
   *
   * Deliberately not `fetchData`: that would set the page back to its loading
   * state and flash the whole record away for one changed attribute.
   */
  const refreshComponent = React.useCallback(async () => {
    if (!id) return;
    try {
      setComponent(await componentsApi.getById(id));
    } catch {
      // A failed refresh leaves the last known record on screen; the next
      // navigation or reload reconciles it.
    }
  }, [id]);

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

  const manufacturer = component.manufacturerId
    ? manufacturerMap.get(component.manufacturerId)
    : undefined;
  const category = component.categoryId
    ? categoryMap.get(component.categoryId)
    : undefined;
  const showIntelligenceEntry = hasSpecificationIntelligence(intelligenceState);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={component.name}
        description={`SKU: ${component.sku}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => setIsPrintOpen(true)}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print Label
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

      {/* Inventory Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          className="p-3.5"
          title="Current Stock"
          value={`${currentStock} ${component.unit}`}
          subtitle="On-hand ledger total"
          icon={Package}
        />
        <StatCard
          className="p-3.5"
          title="Reserved"
          value={`0 ${component.unit}`}
          subtitle="Allocated orders"
          icon={Layers}
        />
        <StatCard
          className="p-3.5"
          title="Available"
          value={`${availableStock} ${component.unit}`}
          subtitle="Net unallocated stock"
          icon={Package}
        />
        <StatCard
          className="p-3.5"
          title="Reorder Level"
          value={`10 ${component.unit}`}
          subtitle="Safety threshold"
          icon={Activity}
        />
        <StatCard
          className="p-3.5"
          title="Min Stock"
          value={`5 ${component.unit}`}
          subtitle="Floor balance"
          icon={Activity}
        />
        <StatCard
          className="p-3.5"
          title="Max Stock"
          value={`100 ${component.unit}`}
          subtitle="Ceiling limit"
          icon={Activity}
        />
      </div>

      {/* Basic Information */}
      <SectionCard
        title="Basic Information"
        description="Core inventory master parameters and classification."
        icon={Info}
        contentClassName="p-0"
      >
        <DetailFields className="px-6 py-5">
          <DetailField label="Component ID">
            <DetailChip mono>{component.id}</DetailChip>
          </DetailField>

          <DetailField label="Status">
            <RecordStatusBadge isActive={component.isActive} />
          </DetailField>

          <DetailField label="SKU / Part Number">
            <DetailMono>{component.sku}</DetailMono>
          </DetailField>

          <DetailField label="Default Unit">
            <DetailMono className="uppercase">{component.unit}</DetailMono>
          </DetailField>

          <DetailField label="Manufacturer">
            {manufacturer ? (
              <DetailText className="text-xs">
                {manufacturer.code} - {manufacturer.name}
              </DetailText>
            ) : component.manufacturerId ? (
              <DetailMono className="font-normal text-muted-foreground">
                {component.manufacturerId}
              </DetailMono>
            ) : (
              <DetailMuted>Unassigned</DetailMuted>
            )}
          </DetailField>

          <DetailField label="Category">
            {category ? (
              <DetailText className="text-xs">
                {category.code} - {category.name}
              </DetailText>
            ) : component.categoryId ? (
              <DetailMono className="font-normal text-muted-foreground">
                {component.categoryId}
              </DetailMono>
            ) : (
              <DetailMuted>Unassigned</DetailMuted>
            )}
          </DetailField>

          <DetailField
            label="Description"
            className="sm:col-span-2 lg:col-span-1 xl:col-span-2"
          >
            {component.description ? (
              <DetailText>{component.description}</DetailText>
            ) : (
              <DetailMuted>No description provided.</DetailMuted>
            )}
          </DetailField>
        </DetailFields>

        <SectionCardFooter>
          <RecordTimestamps
            createdAt={component.createdAt}
            updatedAt={component.updatedAt}
          />
        </SectionCardFooter>
      </SectionCard>

      {/* Product Specifications */}
      <SectionCard
        title="Product Specifications"
        description="Category-driven technical specifications and properties."
        icon={Sliders}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSpecsOpen(true)}
            className="h-8 gap-1.5 text-xs"
          >
            <Sliders className="size-3.5 text-primary" />
            Manage Attributes
          </Button>
        }
      >
        {component.attributes &&
        Object.keys(component.attributes).length > 0 ? (
          /*
           * Label over value, one specification per cell.
           *
           * The previous label/value row pushed the two apart across the full
           * card width, which made a specification hard to read as a pair and
           * wasted most of the row. Stacking them keeps each specification in
           * one column of a responsive grid, and the columns multiply with the
           * viewport so a component with twelve attributes still fits without
           * scrolling. Ordering is the API's own — attributes are never sorted
           * or regrouped here.
           */
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Object.entries(component.attributes).map(([code, attr]) => (
              <div key={code} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">
                  {attr.name || code}
                </dt>
                <dd className="mt-1">
                  <AttributeValue attr={attr} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState
            compact
            title="No specifications have been added yet"
            description="Add attributes to capture technical properties for this component."
          />
        )}
      </SectionCard>

      {/* Storage & Stock Locations */}
      <SectionCard
        title="Storage & Stock Locations"
        description="Where this component is physically held."
        icon={MapPin}
        contentClassName="p-0"
        actions={
          stockLocations.length > 0 ? (
            <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {stockLocations.length}{" "}
              {stockLocations.length === 1 ? "location" : "locations"} ·{" "}
              {currentStock} {component.unit}
            </span>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => router.push("/goods-receipts")}
              >
                Receive Stock
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => router.push("/warehouse-transfers")}
              >
                Transfer Stock
              </Button>
            </>
          )
        }
      >
        {stockLocations.length > 0 ? (
          <DetailTable
            rows={stockLocations}
            rowKey={(projection) => projection.id}
            columns={[
              {
                key: "location",
                header: "Location",
                width: "46%",
                className: "min-w-0",
                render: (projection) => {
                  const loc = locationMap.get(projection.locationId);
                  return (
                    <>
                      <div
                        className="font-mono text-xs font-semibold text-foreground truncate"
                        title={
                          loc
                            ? `${loc.code} (${loc.name})`
                            : projection.locationId
                        }
                      >
                        {loc ? loc.code : projection.locationId}
                      </div>
                      {loc ? (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {loc.name}
                        </div>
                      ) : null}
                    </>
                  );
                },
              },
              {
                key: "kind",
                header: "Kind",
                width: "18%",
                render: (projection) => {
                  const loc = locationMap.get(projection.locationId);
                  return loc ? (
                    <DetailChip className="capitalize">{loc.kind}</DetailChip>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  );
                },
              },
              {
                key: "onHand",
                header: "On Hand",
                align: "right",
                width: "36%",
                className: "whitespace-nowrap",
                render: (projection) => (
                  <span className="font-mono text-xs font-bold text-foreground">
                    {projection.quantity}{" "}
                    {projection.unitOfMeasure || component.unit}
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <div className="space-y-1 px-6 py-5">
            <p className="text-xs text-muted-foreground">
              {stockWithoutLocationBreakdown
                ? `This component has ${currentStock} ${component.unit} on hand, but no location accounts for it yet. Post a receipt or transfer to place the stock.`
                : "No stock stored in warehouse locations yet."}
            </p>
            {defaultLocation ? (
              <p className="text-xs text-muted-foreground">
                Default location:{" "}
                <span className="font-mono text-foreground">
                  {defaultLocation.code}
                </span>{" "}
                — {defaultLocation.name}
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>

      {/* Inventory Transaction Ledger */}
      <SectionCard
        title="Inventory Transaction Ledger"
        description="Auditable movement history posted to the inventory ledger."
        icon={History}
        contentClassName="p-0"
        actions={
          <span className="font-mono text-xs text-muted-foreground">
            {transactions.length} movements
          </span>
        }
      >
        {transactions.length > 0 ? (
          <DetailTable
            rows={transactions}
            rowKey={(tx) => tx.id}
            columns={[
              {
                key: "date",
                header: "Date",
                width: "16%",
                className: "whitespace-nowrap",
                render: (tx) => (
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    title={new Date(tx.createdAt).toLocaleString()}
                  >
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </span>
                ),
              },
              {
                key: "type",
                header: "Type",
                width: "14%",
                render: (tx) => (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                      tx.transactionType === "Receipt"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : tx.transactionType === "Issue"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    }`}
                  >
                    {tx.transactionType}
                  </span>
                ),
              },
              {
                key: "quantity",
                header: "Quantity",
                align: "right",
                width: "14%",
                className: "whitespace-nowrap",
                render: (tx) => {
                  const isPositive = [
                    "Receipt",
                    "Return",
                    "Production",
                    "InitialStock",
                  ].includes(tx.transactionType);
                  return (
                    <span
                      className={`font-mono text-xs font-bold ${
                        isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {tx.quantity} {tx.unitOfMeasure || component.unit}
                    </span>
                  );
                },
              },
              {
                key: "location",
                header: "Location",
                width: "22%",
                className: "min-w-0",
                render: (tx) => {
                  const targetLoc = tx.destinationLocationId
                    ? locationMap.get(tx.destinationLocationId)
                    : tx.sourceLocationId
                      ? locationMap.get(tx.sourceLocationId)
                      : null;
                  return (
                    <span
                      className="font-mono text-xs text-foreground truncate block"
                      title={
                        targetLoc
                          ? `${targetLoc.code} (${targetLoc.name})`
                          : undefined
                      }
                    >
                      {targetLoc
                        ? `${targetLoc.code} (${targetLoc.name})`
                        : "—"}
                    </span>
                  );
                },
              },
              {
                key: "reference",
                header: "Reference / Reason",
                width: "20%",
                className: "min-w-0",
                render: (tx) => (
                  <>
                    <div
                      className="font-mono text-xs font-medium text-foreground truncate"
                      title={tx.reference || undefined}
                    >
                      {tx.reference || "—"}
                    </div>
                    {tx.reason && (
                      <div
                        className="text-[11px] text-muted-foreground truncate"
                        title={tx.reason}
                      >
                        {tx.reason}
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: "createdBy",
                header: "Created By",
                width: "14%",
                className: "min-w-0",
                render: (tx) => (
                  <span
                    className="text-xs text-muted-foreground truncate block"
                    title={tx.createdBy}
                  >
                    {tx.createdBy}
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <p className="px-6 py-5 text-xs text-muted-foreground">
            No inventory transactions recorded for this component yet.
          </p>
        )}
      </SectionCard>

      {/* Documentation, with Documentation Intelligence as a dialog */}
      <DocumentationPanel
        entityType="Component"
        entityId={component.id}
        headerActions={
          showIntelligenceEntry ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={intelligenceLoading || intelligenceRunning}
              onClick={openIntelligence}
            >
              <Sparkles
                className={cn(
                  "size-3.5 text-primary",
                  (intelligenceLoading || intelligenceRunning) &&
                    "animate-pulse",
                )}
              />
              {intelligenceEntryLabel(intelligenceState)}
            </Button>
          ) : null
        }
      />

      <ComponentSpecificationIntelligenceDialog
        isOpen={isIntelligenceOpen}
        onClose={closeIntelligence}
        state={intelligenceState}
        loading={intelligenceLoading}
        running={intelligenceRunning}
        error={intelligenceError}
        notice={intelligenceNotice}
        canWrite={canWrite}
        onRefresh={() => void loadIntelligence()}
        onAnalyze={() => void runIntelligence()}
        onSpecificationsChange={handleSpecificationsChange}
        onApplied={() => void refreshComponent()}
      />

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Component"
        description={`Update component "${component.sku}" using the standardized dialog composition.`}
        size="md"
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

      {/* Print Component Label Modal */}
      {component && (
        <PrintLabelDialog
          isOpen={isPrintOpen}
          onClose={() => setIsPrintOpen(false)}
          entityType="COMPONENT"
          entityId={component.id}
          defaultTemplate="STANDARD"
          title={`Print Component Label: ${component.sku}`}
        />
      )}

      {/* Manage Dynamic Specifications Dialog */}
      {component && (
        <ManageComponentSpecificationsDialog
          isOpen={isSpecsOpen}
          componentId={component.id}
          componentName={component.name}
          categoryId={component.categoryId}
          onClose={() => setIsSpecsOpen(false)}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}

/**
 * One attribute value: dominant, wrapping, never clipped.
 *
 * The value is the reason the section exists, so it carries the weight and the
 * label stays quiet above it. Long values wrap onto as many lines as they need
 * rather than truncating — a clipped package code or temperature range is worse
 * than a taller cell.
 */
function AttributeText({ text }: { text: string }) {
  return (
    <span className="font-mono text-sm font-semibold break-words text-foreground">
      {text}
    </span>
  );
}

/**
 * The value for one dynamic attribute.
 *
 * Branches on the attribute's own data type so a multi-select keeps its options
 * and a boolean reads as Yes/No rather than as a raw value. Everything else is
 * rendered from the API's `displayValue` — the single authoritative rendering of
 * a stored attribute — so quantities keep the unit they were stored with,
 * selects keep their option label, and no unit is ever assembled on this page.
 * Values are plain text, not bordered tiles: the section is a specification
 * list, and a card per attribute spends more space on padding than on the value.
 */
function AttributeValue({
  attr,
}: {
  attr: NonNullable<ComponentDto["attributes"]>[string];
}) {
  if (attr.dataType === "MULTI_SELECT") {
    const items = (attr.displayValue || String(attr.value || ""))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      return <AttributeText text="—" />;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (attr.dataType === "BOOLEAN") {
    const booleanText =
      attr.value === true ||
      attr.displayValue === "Yes" ||
      attr.displayValue === "true";
    return (
      <span
        className={cn(
          "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
          booleanText
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        {booleanText ? "Yes" : "No"}
      </span>
    );
  }

  if (attr.dataType === "DATE") {
    return (
      <AttributeText
        text={
          typeof attr.value === "string" && !isNaN(Date.parse(attr.value))
            ? new Date(attr.value).toLocaleDateString()
            : attr.displayValue || String(attr.value ?? "—")
        }
      />
    );
  }

  return (
    <AttributeText
      text={attr.optionLabel || attr.displayValue || String(attr.value ?? "—")}
    />
  );
}
