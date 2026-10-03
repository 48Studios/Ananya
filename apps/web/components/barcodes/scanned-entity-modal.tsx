"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Layers,
  Printer,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  Box,
  FileText,
  Briefcase,
  Search,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { BarcodeLookupResult } from "@/lib/api/barcodes-api";
import {
  spatialApi,
  type LocationLocateTargetDto,
  type ComponentLocateResolutionDto,
} from "@/lib/api/spatial-api";
import { LocateDialog } from "@/components/spatial/locate-dialog";
import { PrintLabelDialog } from "./print-label-dialog";

export interface ScannedEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BarcodeLookupResult | null;
  onScanAnother?: () => void;
  /**
   * Whether the modal may take the operator off the surface it was opened from.
   *
   * The standalone scanner app (`/scan`) sets this to `false`: it runs as its
   * own installable surface, so "Open Full Page" would leave the scanner and
   * turn a scan into a page visit. In that mode the footer collapses to a
   * single action that returns to the camera. Every other caller keeps the
   * default, so the ERP's own behaviour is unchanged.
   */
  allowNavigation?: boolean;
}

interface ContainingComponentItem {
  componentId: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
}

export function ScannedEntityModal({
  isOpen,
  onClose,
  result,
  onScanAnother,
  allowNavigation = true,
}: ScannedEntityModalProps) {
  const router = useRouter();
  const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
  const [componentFilter, setComponentFilter] = React.useState("");

  // Spatial locate resolution state
  const [spatialLocate, setSpatialLocate] =
    React.useState<LocationLocateTargetDto | null>(null);
  const [componentLocateResolution, setComponentLocateResolution] =
    React.useState<ComponentLocateResolutionDto | null>(null);
  const [isLocateChooserOpen, setIsLocateChooserOpen] = React.useState(false);

  // Sub-component print label trigger
  const [subPrintTarget, setSubPrintTarget] = React.useState<{
    id: string;
    type: "COMPONENT";
  } | null>(null);

  React.useEffect(() => {
    if (!isOpen || !result) {
      setSpatialLocate(null);
      setComponentLocateResolution(null);
      setIsLocateChooserOpen(false);
      return;
    }

    if (result.entityType === "LOCATION") {
      spatialApi
        .resolveLocationLocate(result.entityId)
        .then((res) => setSpatialLocate(res))
        .catch(() => setSpatialLocate(null));
    } else if (result.entityType === "COMPONENT") {
      spatialApi
        .resolveComponentLocate(result.entityId)
        .then((res) => setComponentLocateResolution(res))
        .catch(() => setComponentLocateResolution(null));
    }
  }, [isOpen, result]);

  if (!result) return null;

  const handleNavigate = (url?: string) => {
    // Belt and braces: the scanner surface has no navigation to fall back on,
    // so the guard lives here as well as on the buttons that call it.
    if (!allowNavigation) return;
    onClose();
    const destination = url || result.targetUrl;
    if (destination) {
      router.push(destination);
    }
  };

  const handleLocateSpatial = () => {
    if (!allowNavigation) return;
    if (spatialLocate?.locateUrl) {
      handleNavigate(spatialLocate.locateUrl);
    }
  };

  const handleLocateComponentStock = () => {
    if (!allowNavigation) return;
    if (
      !componentLocateResolution ||
      componentLocateResolution.targets.length === 0
    ) {
      return;
    }
    if (
      componentLocateResolution.targets.length === 1 &&
      componentLocateResolution.targets[0]
    ) {
      handleNavigate(componentLocateResolution.targets[0].locateUrl);
    } else {
      setIsLocateChooserOpen(true);
    }
  };

  const handleScanAnother = () => {
    if (onScanAnother) {
      onScanAnother();
    } else {
      onClose();
    }
  };

  const containingComponents = (
    Array.isArray(result.details?.containingComponents)
      ? result.details?.containingComponents
      : []
  ) as ContainingComponentItem[];

  const filteredComponents = containingComponents.filter((comp) => {
    if (!componentFilter.trim()) return true;
    const term = componentFilter.toLowerCase();
    return (
      comp.sku.toLowerCase().includes(term) ||
      comp.name.toLowerCase().includes(term)
    );
  });

  const getEntityIcon = () => {
    switch (result.entityType) {
      case "LOCATION":
        return <MapPin className="size-5 text-primary" />;
      case "COMPONENT":
        return <Box className="size-5 text-primary" />;
      case "PURCHASE_ORDER":
      case "WORK_ORDER":
        return <FileText className="size-5 text-primary" />;
      case "PROJECT":
        return <Briefcase className="size-5 text-primary" />;
      default:
        return <CheckCircle2 className="size-5 text-primary" />;
    }
  };

  const modalTitle = (
    <div className="flex flex-row items-center gap-3">
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
        {getEntityIcon()}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-row items-center gap-1">
          <span>
            {result.entityType === "LOCATION" && "Location Scanned"}
            {result.entityType === "COMPONENT" && "Component Scanned"}
            {result.entityType === "PURCHASE_ORDER" && "Purchase Order Scanned"}
            {result.entityType === "WORK_ORDER" && "Work Order Scanned"}
            {result.entityType === "PROJECT" && "Project Scanned"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
          {result.subtitle}
        </span>
      </div>
    </div>
  );

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={modalTitle}
        description={null}
        size="lg"
      >
        <DialogShellBody className="space-y-4">
          {/* Header Identity Card */}
          <div className="p-4 bg-muted/20 border border-border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">
                {result.name}
              </h3>
              {Boolean(result.details?.locationPath) && (
                <p className="text-xs font-mono text-primary flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  {String(result.details?.locationPath)}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPrintModalOpen(true)}
              >
                <Printer className="size-3.5 mr-1.5" />
                Print Label
              </Button>

              {allowNavigation &&
                result.entityType === "LOCATION" &&
                spatialLocate?.hasSpatialView && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleLocateSpatial}
                    className="gap-1.5 font-medium"
                    title="Locate in 2D Spatial View"
                  >
                    <MapPin className="size-3.5" />
                    <span>Locate in Spatial</span>
                  </Button>
                )}

              {allowNavigation &&
                result.entityType === "COMPONENT" &&
                componentLocateResolution &&
                componentLocateResolution.targets.length > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleLocateComponentStock}
                    className="gap-1.5 font-medium"
                    title="Locate physical stock in storage"
                  >
                    <MapPin className="size-3.5" />
                    <span>Locate Stock</span>
                  </Button>
                )}

              {allowNavigation ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigate()}
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  {result.entityType === "LOCATION"
                    ? "Open Location"
                    : result.entityType === "COMPONENT"
                    ? "Open Component"
                    : "Open Full Page"}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Location View: Spatial Layout Banner */}
          {result.entityType === "LOCATION" && spatialLocate?.hasSpatialView && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="font-semibold text-foreground">
                    Spatial 2D Layout Available
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Spatial Root: <strong className="font-mono text-foreground">{spatialLocate.spatialRootLocationCode}</strong>
                    {spatialLocate.focusLocationCode !== spatialLocate.spatialRootLocationCode && (
                      <> • Target Compartment: <strong className="font-mono text-foreground">{spatialLocate.focusLocationCode}</strong></>
                    )}
                  </p>
                </div>
              </div>
              {allowNavigation && (
                <Button
                  size="xs"
                  onClick={handleLocateSpatial}
                  className="gap-1 text-[11px]"
                >
                  <span>Open Spatial</span>
                  <ExternalLink className="size-3" />
                </Button>
              )}
            </div>
          )}

          {/* Location View: Containing Components */}
          {result.entityType === "LOCATION" && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">
                    Containing Components & Inventory
                  </h4>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                    {containingComponents.length} items
                  </span>
                </div>

                {containingComponents.length > 3 && (
                  <div className="relative w-full sm:w-56">
                    <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={componentFilter}
                      onChange={(e) => setComponentFilter(e.target.value)}
                      placeholder="Filter components..."
                      className="w-full pl-8 pr-2 py-1 text-xs bg-input/40 border border-border rounded-md outline-none focus:border-primary text-foreground"
                    />
                  </div>
                )}
              </div>

              {filteredComponents.length > 0 ? (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto divide-y divide-border">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/40 sticky top-0 font-semibold text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3">SKU</th>
                          <th className="py-2 px-3">Component Name</th>
                          <th className="py-2 px-3 text-right">Quantity</th>
                          <th className="py-2 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredComponents.map((comp) => (
                          <tr
                            key={comp.componentId}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono font-bold text-foreground whitespace-nowrap">
                              {comp.sku}
                            </td>
                            <td className="py-2.5 px-3 text-foreground truncate max-w-xs">
                              {comp.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-right whitespace-nowrap">
                              {comp.quantity} {comp.unit}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() =>
                                    setSubPrintTarget({
                                      id: comp.componentId,
                                      type: "COMPONENT",
                                    })
                                  }
                                  title="Print component label"
                                >
                                  <Printer className="size-3" />
                                  <span className="sr-only">Print</span>
                                </Button>
                                {allowNavigation ? (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                      onClose();
                                      router.push(`/inventory/components/${comp.componentId}`);
                                    }}
                                    title="View component details"
                                  >
                                    <ExternalLink className="size-3" />
                                    <span className="sr-only">View</span>
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center border border-dashed border-border rounded-lg bg-muted/10 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {componentFilter
                      ? "No containing components match your search filter."
                      : "No inventory components currently stored in this location."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Component View: Stock & Storage Location Details */}
          {result.entityType === "COMPONENT" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-background border border-border rounded-lg space-y-1">
                  <span className="text-xs text-muted-foreground block font-medium">
                    Total On-Hand Stock
                  </span>
                  <span className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                    {String(result.details?.totalStock ?? 0)}{" "}
                    {String(result.details?.unit ?? "")}
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Aggregated across all inventory locations
                  </span>
                </div>

                <div className="p-3.5 bg-background border border-border rounded-lg space-y-1">
                  <span className="text-xs text-muted-foreground block font-medium">
                    Default Storage Location
                  </span>
                  <span className="text-sm font-mono text-foreground font-semibold flex items-center gap-1.5 pt-0.5">
                    <MapPin className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      {String(
                        result.details?.defaultLocationPath || "Unassigned",
                      )}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Primary assigned bin / shelf
                  </span>
                </div>

                {Boolean(result.details?.description) && (
                  <div className="sm:col-span-2 p-3 bg-muted/20 border border-border rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">
                      Description
                    </span>
                    <p className="text-xs text-foreground leading-relaxed">
                      {String(result.details?.description)}
                    </p>
                  </div>
                )}
              </div>

              {/* Physical Stock Locations with Spatial Deep Links */}
              {componentLocateResolution &&
                componentLocateResolution.targets.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-primary" />
                        Physical Stock Locations ({componentLocateResolution.targets.length})
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        Total Stock: {componentLocateResolution.totalOnHand.toLocaleString()}{" "}
                        {String(result.details?.unit ?? "units")}
                      </span>
                    </div>

                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden bg-card text-xs">
                      {componentLocateResolution.targets.map((tgt) => (
                        <div
                          key={tgt.locationId}
                          className="flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-foreground">
                                {tgt.locationCode}
                              </span>
                              <span className="text-muted-foreground truncate">
                                {tgt.locationName}
                              </span>
                              {tgt.hasSpatialView ? (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  2D View
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                                  Standard
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {tgt.path}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="font-mono text-xs font-semibold text-foreground block">
                                {tgt.onHand.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {tgt.available.toLocaleString()} avail
                              </span>
                            </div>
                            {allowNavigation && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleNavigate(tgt.locateUrl)}
                                className="h-6 px-2 text-[11px] gap-1"
                              >
                                <span>Locate</span>
                                <ExternalLink className="size-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Work Order / Purchase Order / Project Details */}
          {(result.entityType === "WORK_ORDER" ||
            result.entityType === "PURCHASE_ORDER" ||
            result.entityType === "PROJECT") && (
            <div className="p-4 bg-background border border-border rounded-lg grid grid-cols-2 gap-3 text-xs">
              {Object.entries(result.details || {}).map(([key, val]) => {
                if (typeof val === "object" && val !== null) return null;
                return (
                  <div key={key} className="space-y-0.5">
                    <span className="text-muted-foreground uppercase text-[10px] tracking-wider block">
                      {key.replace(/([A-Z])/g, " $1")}
                    </span>
                    <span className="font-mono text-foreground font-semibold block truncate">
                      {String(val ?? "—")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DialogShellBody>

        {allowNavigation ? (
          <DialogShellFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            {onScanAnother ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleScanAnother}
                className="w-full sm:w-auto"
              >
                <RotateCcw className="size-3.5 mr-1.5" />
                Scan Another
              </Button>
            ) : (
              <div />
            )}

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                Close
              </Button>

              {result.entityType === "LOCATION" &&
                spatialLocate?.hasSpatialView && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleLocateSpatial}
                    className="w-full sm:w-auto gap-1.5 font-medium"
                  >
                    <MapPin className="size-3.5" />
                    Locate in Spatial
                  </Button>
                )}

              {result.entityType === "COMPONENT" &&
                componentLocateResolution &&
                componentLocateResolution.targets.length > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleLocateComponentStock}
                    className="w-full sm:w-auto gap-1.5 font-medium"
                  >
                    <MapPin className="size-3.5" />
                    Locate Stock
                  </Button>
                )}

              <Button
                variant={
                  (result.entityType === "LOCATION" && spatialLocate?.hasSpatialView) ||
                  (result.entityType === "COMPONENT" &&
                    componentLocateResolution &&
                    componentLocateResolution.targets.length > 0)
                    ? "outline"
                    : "default"
                }
                size="sm"
                onClick={() => handleNavigate()}
                className="w-full sm:w-auto"
              >
                {result.entityType === "LOCATION"
                  ? "Open Location"
                  : result.entityType === "COMPONENT"
                  ? "Open Component"
                  : "Open Full Page"}
                <ExternalLink className="size-3.5 ml-1.5" />
              </Button>
            </div>
          </DialogShellFooter>
        ) : (
          <DialogShellFooter>
            <Button size="sm" className="w-full" onClick={handleScanAnother}>
              <ScanLine className="size-3.5 mr-1.5" />
              Scan Next
            </Button>
          </DialogShellFooter>
        )}
      </DialogShell>

      {/* Multi-location Component Locate Chooser Dialog */}
      {isLocateChooserOpen && componentLocateResolution && (
        <LocateDialog
          open={isLocateChooserOpen}
          onOpenChange={setIsLocateChooserOpen}
          componentSku={result.code}
          componentName={result.name}
          targets={componentLocateResolution.targets}
          unit={String(result.details?.unit ?? "units")}
        />
      )}

      {/* Main Print Label Dialog for this entity */}
      <PrintLabelDialog
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        entityType={result.entityType}
        entityId={result.entityId}
      />

      {/* Sub-item print label modal if triggered from table */}
      {subPrintTarget && (
        <PrintLabelDialog
          isOpen={Boolean(subPrintTarget)}
          onClose={() => setSubPrintTarget(null)}
          entityType={subPrintTarget.type}
          entityId={subPrintTarget.id}
        />
      )}
    </>
  );
}
