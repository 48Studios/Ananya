"use client";

import * as React from "react";
import {
  Scan,
  Printer,
  Cpu,
  MapPin,
  QrCode,
  Sparkles,
  Tag,
  Search,
  Check,
  ChevronDown,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LabelPreview } from "@/components/barcodes/label-preview";
import {
  LabelTemplate,
  TEMPLATE_OPTIONS,
  isQrOnlyTemplate,
} from "@/components/barcodes/templates";
import { ScanDialog } from "@/components/barcodes/scan-dialog";
import { BatchPrintDialog } from "@/components/barcodes/batch-print-dialog";
import {
  BarcodeFormat,
  LabelData,
  EntityType,
  barcodesApi,
} from "@/lib/api/barcodes-api";
import { componentsApi, ComponentDto } from "@/lib/api/components-api";
import { locationsApi, LocationDto } from "@/lib/api/locations-api";
import { printLabelDocument } from "@/lib/print/print-document";

const FORMAT_OPTIONS: Record<BarcodeFormat, string> = {
  CODE128: "Code 128 (High Density)",
  CODE39: "Code 39 (Alphanumeric)",
  EAN13: "EAN-13 (13 Digits)",
  UPCA: "UPC-A (12 Digits)",
};

/**
 * Preview magnifications, keyed by the multiplier the Select carries as a string.
 *
 * The ladder exists because some faces are physically tiny — the 1.1 cm QR label
 * is 42 px across at actual size, which is unreadable on screen. 800% is what
 * makes its item code legible without a loupe.
 */
const PREVIEW_ZOOM_OPTIONS: Record<string, string> = {
  "1": "Actual size (100%)",
  "1.5": "150%",
  "2": "200%",
  "3": "300%",
  "4": "400%",
  "6": "600%",
  "8": "800%",
};

/** CSS reference pixels per millimetre (96 dpi). */
const MM_PER_CSS_PX = 25.4 / 96;

/**
 * The printed footprint of a measured label, in millimetres.
 *
 * Shown beside the zoom because the faces mix two units internally — some are
 * built from Tailwind's px scale, others from `mm` — so the number an operator
 * needs before printing is the physical size, not the class names.
 */
function labelFootprintMm(width: number, height: number): string {
  return `${(width * MM_PER_CSS_PX).toFixed(1)} × ${(height * MM_PER_CSS_PX).toFixed(1)} mm`;
}

type StudioMode = "SPECIFIC_ENTITY" | "CUSTOM_PAYLOAD";

export default function BarcodesHubPage() {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [isScanOpen, setIsScanOpen] = React.useState(false);
  const [isBatchOpen, setIsBatchOpen] = React.useState(false);
  const [batchEntityType, setBatchEntityType] =
    React.useState<EntityType>("COMPONENT");
  const [batchEntityIds, setBatchEntityIds] = React.useState<string[]>([]);

  // Studio Mode State
  const [studioMode, setStudioMode] =
    React.useState<StudioMode>("SPECIFIC_ENTITY");
  const [selectedEntityType, setSelectedEntityType] =
    React.useState<EntityType>("LOCATION");
  const [selectedEntityId, setSelectedEntityId] = React.useState<string>("");
  const [entitySearch, setEntitySearch] = React.useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  // Label configuration & preview state
  const [format, setFormat] = React.useState<BarcodeFormat>("CODE128");
  const [template, setTemplate] = React.useState<LabelTemplate>("SHELF_BIN");
  const [activeLabel, setActiveLabel] = React.useState<LabelData | null>(null);
  const [labelLoading, setLabelLoading] = React.useState(false);

  // Live preview magnification. The previewed label is a physical object, so
  // only the on-screen presentation scales — never the label's own CSS.
  const [previewZoom, setPreviewZoom] = React.useState(1);
  const labelBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [labelFootprint, setLabelFootprint] = React.useState<{
    width: number;
    height: number;
  } | null>(null);

  // Custom Generator Manual State
  const [sampleCode, setSampleCode] = React.useState("ANANYA-INV-2026");
  const [sampleQr, setSampleQr] = React.useState(
    "ANANYA:V1:COMPONENT:demo-id-123",
  );

  // Initial data loading
  React.useEffect(() => {
    Promise.all([
      componentsApi.getAll().catch(() => []),
      locationsApi.getAll().catch(() => []),
    ])
      .then(([comps, locs]) => {
        setComponents(comps);
        setLocations(locs);
        // Default to first location if available
        if (locs[0]) {
          setSelectedEntityId(locs[0].id);
        } else if (comps[0]) {
          setSelectedEntityType("COMPONENT");
          setSelectedEntityId(comps[0].id);
          setTemplate("STANDARD");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch or generate label payload whenever entity selection changes
  React.useEffect(() => {
    if (studioMode !== "SPECIFIC_ENTITY" || !selectedEntityId) return;

    let isMounted = true;
    setLabelLoading(true);

    barcodesApi
      .generatePayload(selectedEntityType, selectedEntityId)
      .then((data) => {
        if (isMounted) {
          setActiveLabel(data);
        }
      })
      .catch(() => {
        // Fallback synthetic label if API error
        if (isMounted) {
          if (selectedEntityType === "LOCATION") {
            const loc = locations.find((l) => l.id === selectedEntityId);
            setActiveLabel({
              id: selectedEntityId,
              entityType: "LOCATION",
              primaryCode: loc?.code || "LOC-001",
              qrPayload: `ANANYA:V1:LOCATION:${selectedEntityId}`,
              title: loc?.name || "Storage Location",
              subtitle: loc?.code || "LOC-001",
              attribute1: loc?.name?.toUpperCase() || "STORAGE LOCATION",
            });
          } else {
            const comp = components.find((c) => c.id === selectedEntityId);
            setActiveLabel({
              id: selectedEntityId,
              entityType: "COMPONENT",
              primaryCode: comp?.sku || "CMP-001",
              qrPayload: `ANANYA:V1:COMPONENT:${selectedEntityId}`,
              title: comp?.name || "Inventory Item",
              subtitle: `SKU: ${comp?.sku || "CMP-001"}`,
            });
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setLabelLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [studioMode, selectedEntityType, selectedEntityId, locations, components]);

  /**
   * Print the single previewed face on its own sheet.
   *
   * `labelBoxRef` holds the scaled preview, so the FACE is cloned rather than
   * the scaler: the magnifier is an on-screen aid and must never reach the
   * printer. The clone is untransformed, so it prints at its natural size.
   */
  const handlePrintLabel = () => {
    const face = labelBoxRef.current?.firstElementChild;
    if (!(face instanceof HTMLElement)) return;
    void printLabelDocument({ sources: [{ node: face }] });
  };

  // Handle switching entity type
  const handleEntityTypeChange = (type: EntityType) => {
    setSelectedEntityType(type);
    setEntitySearch("");
    if (type === "LOCATION") {
      setTemplate("SHELF_BIN");
      if (locations[0]) {
        setSelectedEntityId(locations[0].id);
      }
    } else {
      setTemplate("STANDARD");
      if (components[0]) {
        setSelectedEntityId(components[0].id);
      }
    }
  };

  // Filtered entity search list
  const filteredEntities = React.useMemo(() => {
    const q = entitySearch.toLowerCase().trim();
    if (selectedEntityType === "LOCATION") {
      if (!q) return locations;
      return locations.filter(
        (l) =>
          l.code.toLowerCase().includes(q) ||
          l.name.toLowerCase().includes(q) ||
          l.kind.toLowerCase().includes(q),
      );
    } else {
      if (!q) return components;
      return components.filter(
        (c) =>
          c.sku.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
      );
    }
  }, [selectedEntityType, entitySearch, locations, components]);

  const selectedEntity = React.useMemo(() => {
    if (selectedEntityType === "LOCATION") {
      return locations.find((l) => l.id === selectedEntityId);
    }
    return components.find((c) => c.id === selectedEntityId);
  }, [selectedEntityType, selectedEntityId, locations, components]);

  // Fallback label for manual custom mode
  const customLabel: LabelData = {
    id: "custom-test-preview",
    entityType: "COMPONENT",
    primaryCode: sampleCode || "ANANYA-INV-2026",
    qrPayload: sampleQr || "ANANYA:V1:COMPONENT:demo-id-123",
    title: "Custom Preview Label",
    subtitle: sampleCode || "ANANYA-INV-2026",
    attribute1: "48 STUDIOS / CENTRAL WAREHOUSE",
  };

  const previewLabel =
    studioMode === "SPECIFIC_ENTITY" && activeLabel
      ? activeLabel
      : customLabel;

  /**
   * Measure the label's natural (unzoomed) size, which is what the scaler
   * reserves scrollable space for and what the footprint readout reports.
   *
   * The measured node sits inside the zoom transform, so its rect is the
   * natural size times the zoom — dividing by the zoom recovers the exact
   * fractional size. `offsetWidth` would be simpler but rounds to whole pixels,
   * and a 11 mm label is 41.6 px: rounded, it would report 11.1 mm.
   *
   * Reading the zoom through a ref (rather than as a dependency) is what lets
   * this callback stay stable, so switching zoom does not tear down and rebuild
   * the ResizeObserver that calls it.
   */
  const previewZoomRef = React.useRef(previewZoom);
  previewZoomRef.current = previewZoom;

  const measureLabelFootprint = React.useCallback(() => {
    const node = labelBoxRef.current;
    if (!node) return;
    const zoom = previewZoomRef.current || 1;
    const rect = node.getBoundingClientRect();
    const width = rect.width / zoom;
    const height = rect.height / zoom;
    setLabelFootprint((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

  // Layout effect, so the footprint is in place before the browser paints.
  React.useLayoutEffect(measureLabelFootprint, [
    measureLabelFootprint,
    template,
    format,
    previewLabel,
    previewZoom,
  ]);

  // A template switch, a font swap or a reflow can all change the label's size
  // without it remounting, so it is watched rather than only sampled.
  React.useEffect(() => {
    const node = labelBoxRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureLabelFootprint);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureLabelFootprint]);

  const handleOpenBatchComponents = () => {
    setBatchEntityType("COMPONENT");
    setBatchEntityIds(components.slice(0, 20).map((c) => c.id));
    setIsBatchOpen(true);
  };

  const handleOpenBatchLocations = () => {
    setBatchEntityType("LOCATION");
    setBatchEntityIds(locations.slice(0, 20).map((l) => l.id));
    setIsBatchOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="print:hidden">
        <PageHeader
          title="Barcode & QR Operations Studio"
          description="Print labels individually for locations and components, generate QR payloads, and scan with camera or hardware scanner."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsScanOpen(true)}
              >
                <Scan className="w-4 h-4 mr-1.5 text-primary" />
                Quick Scan
              </Button>
              <Button size="sm" onClick={handleOpenBatchComponents}>
                <Printer className="w-4 h-4 mr-1.5" />
                Batch Print Studio
              </Button>
            </div>
          }
        />
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Printable Locations"
          value={locations.length}
          subtitle="Shelves, bins, racks & zones"
          icon={MapPin}
        />
        <StatCard
          title="Printable Components"
          value={components.length}
          subtitle="Catalog component labels"
          icon={Cpu}
        />
        <StatCard
          title="Supported Formats"
          value="4 Standard"
          subtitle="Code 128, Code 39, EAN13, UPCA"
          icon={QrCode}
        />
        <StatCard
          title="QR Payload Version"
          value="V1 Standard"
          subtitle="ANANYA:V1:TYPE:ID spec"
          icon={Sparkles}
        />
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
        {/* Generator & Entity Selection Controls */}
        <div className="lg:col-span-6 bg-card border border-border rounded-xl p-6 space-y-5 shadow-xs print:hidden">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Label Generation & Printing
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select a specific location or component to generate its print-ready label.
              </p>
            </div>
          </div>

          {/* Mode Switch: Specific Entity vs Custom Payload */}
          <div className="flex rounded-lg border border-border p-1 bg-muted/30">
            <button
              type="button"
              onClick={() => setStudioMode("SPECIFIC_ENTITY")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                studioMode === "SPECIFIC_ENTITY"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Print Specific Entity
            </button>
            <button
              type="button"
              onClick={() => setStudioMode("CUSTOM_PAYLOAD")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                studioMode === "CUSTOM_PAYLOAD"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom Barcode Input
            </button>
          </div>

          {studioMode === "SPECIFIC_ENTITY" ? (
            <div className="space-y-4">
              {/* Entity Type Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedEntityType === "LOCATION" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleEntityTypeChange("LOCATION")}
                  className="justify-center"
                >
                  <MapPin className="w-3.5 h-3.5 mr-1.5" />
                  Location (Shelf / Bin)
                </Button>
                <Button
                  type="button"
                  variant={selectedEntityType === "COMPONENT" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleEntityTypeChange("COMPONENT")}
                  className="justify-center"
                >
                  <Cpu className="w-3.5 h-3.5 mr-1.5" />
                  Component / Item
                </Button>
              </div>

              {/* Specific Entity Searchable Dropdown */}
              <div className="space-y-1.5 relative">
                <label className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>
                    Select {selectedEntityType === "LOCATION" ? "Location (Shelf, Bin, Rack)" : "Component"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {filteredEntities.length} available
                  </span>
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs bg-input/40 border border-border rounded-lg text-left hover:border-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <div className="truncate flex items-center gap-2">
                      <Tag className="size-3.5 text-primary shrink-0" />
                      {selectedEntity ? (
                        <span className="font-medium text-foreground">
                          {selectedEntityType === "LOCATION"
                            ? `${(selectedEntity as LocationDto).code} — ${(selectedEntity as LocationDto).name} (${(selectedEntity as LocationDto).kind})`
                            : `${(selectedEntity as ComponentDto).sku} — ${(selectedEntity as ComponentDto).name}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Choose {selectedEntityType === "LOCATION" ? "location" : "component"}...
                        </span>
                      )}
                    </div>
                    <ChevronDown className="size-3.5 text-muted-foreground ml-2 shrink-0" />
                  </button>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-border">
                        <div className="relative flex items-center">
                          <Search className="size-3.5 absolute left-2.5 text-muted-foreground" />
                          <input
                            type="text"
                            value={entitySearch}
                            onChange={(e) => setEntitySearch(e.target.value)}
                            placeholder={`Search ${selectedEntityType === "LOCATION" ? "shelf, bin, code..." : "SKU, part name..."}`}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 border border-border rounded-md outline-none text-foreground"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-border/60">
                        {filteredEntities.length > 0 ? (
                          filteredEntities.map((ent) => {
                            const isSelected = ent.id === selectedEntityId;
                            return (
                              <button
                                key={ent.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEntityId(ent.id);
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full p-2.5 text-left text-xs flex items-center justify-between hover:bg-muted/40 transition-colors ${
                                  isSelected ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                                }`}
                              >
                                <div className="truncate pr-2">
                                  <div className="font-mono font-bold">
                                    {selectedEntityType === "LOCATION"
                                      ? (ent as LocationDto).code
                                      : (ent as ComponentDto).sku}
                                    {selectedEntityType === "LOCATION" && (
                                      <span className="ml-2 font-sans font-normal text-[10px] capitalize px-1.5 py-0.2 bg-muted text-muted-foreground rounded">
                                        {(ent as LocationDto).kind}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {ent.name}
                                  </div>
                                </div>
                                {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            No matching {selectedEntityType.toLowerCase()}s found.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Template and Symbology Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Field>
                  <FieldLabel className="text-xs">Label Template</FieldLabel>
                  <Select
                    items={TEMPLATE_OPTIONS}
                    value={template}
                    onValueChange={(val) => setTemplate(val as LabelTemplate)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select template">
                        {(val) => TEMPLATE_OPTIONS[val as LabelTemplate] || val}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATE_OPTIONS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel className="text-xs">
                    Barcode Symbology
                    {isQrOnlyTemplate(template) && (
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">
                        (QR tag)
                      </span>
                    )}
                  </FieldLabel>
                  <Select
                    items={FORMAT_OPTIONS}
                    value={format}
                    disabled={isQrOnlyTemplate(template)}
                    onValueChange={(val) => setFormat(val as BarcodeFormat)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select format">
                        {(val) => FORMAT_OPTIONS[val as BarcodeFormat] || val}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FORMAT_OPTIONS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          ) : (
            /* Custom Raw Inputs Mode */
            <div className="space-y-3">
              <Field>
                <FieldLabel className="text-xs">Primary Barcode Text</FieldLabel>
                <Input
                  type="text"
                  value={sampleCode}
                  onChange={(e) => setSampleCode(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. LOC-SHELF-01 or CMP-RES-10K"
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs">
                  Structured QR Payload
                </FieldLabel>
                <Input
                  type="text"
                  value={sampleQr}
                  onChange={(e) => setSampleQr(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. ANANYA:V1:LOCATION:id"
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field>
                  <FieldLabel className="text-xs">Symbology</FieldLabel>
                  <Select
                    items={FORMAT_OPTIONS}
                    value={format}
                    disabled={isQrOnlyTemplate(template)}
                    onValueChange={(val) => setFormat(val as BarcodeFormat)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select format">
                        {(val) => FORMAT_OPTIONS[val as BarcodeFormat] || val}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FORMAT_OPTIONS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel className="text-xs">Template</FieldLabel>
                  <Select
                    items={TEMPLATE_OPTIONS}
                    value={template}
                    onValueChange={(val) => setTemplate(val as LabelTemplate)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select template">
                        {(val) => TEMPLATE_OPTIONS[val as LabelTemplate] || val}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATE_OPTIONS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="pt-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">
              {studioMode === "SPECIFIC_ENTITY" && selectedEntity
                ? `Ready: ${selectedEntityType === "LOCATION" ? (selectedEntity as LocationDto).code : (selectedEntity as ComponentDto).sku}`
                : "Live Vector Preview"}
            </span>
            <Button
              size="sm"
              onClick={handlePrintLabel}
              disabled={labelLoading || !previewLabel}
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print Label
            </Button>
          </div>
        </div>

        {/* Live Vector Label Preview Container */}
        <div className="lg:col-span-6 bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center space-y-4 shadow-xs min-h-[360px] print:border-0 print:bg-transparent print:p-6 print:shadow-none print:min-h-0 print:items-start">
          <div className="w-full flex items-center justify-between gap-3 print:hidden">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Live Label Preview
            </span>

            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-mono text-muted-foreground"
                title="Printed footprint of the label"
              >
                {labelFootprint
                  ? labelFootprintMm(labelFootprint.width, labelFootprint.height)
                  : TEMPLATE_OPTIONS[template]}
              </span>
              <Select
                items={PREVIEW_ZOOM_OPTIONS}
                value={String(previewZoom)}
                onValueChange={(val) => setPreviewZoom(Number(val) || 1)}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Label preview zoom"
                  className="h-8 text-xs"
                >
                  <ZoomIn className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Zoom">
                    {(val) => PREVIEW_ZOOM_OPTIONS[val as string] || val}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PREVIEW_ZOOM_OPTIONS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/*
            A bounded height, so a magnified label scrolls inside the panel
            instead of stretching the studio page to a metre tall. Both axes
            scroll for the same reason: at 800% the 3" shelf tag is 2608 px wide.
          */}
          <div className="p-6 bg-muted/20 border border-border rounded-xl w-full h-full min-h-[260px] max-h-[min(600px,70vh)] grid overflow-auto print:block print:overflow-visible print:border-0 print:bg-transparent print:p-0 print:min-h-0 print:max-h-none">
            {/*
              The scaler reserves the *zoomed* footprint, which is what makes
              the panel scroll instead of clipping when a label is magnified.
              Everything here is presentational: the `print:` resets return the
              label to its own size, so a magnified preview never changes what
              the printer emits.

              `m-auto` inside a grid (not `justify-center` in a flex row) is
              the safe way to centre overflowing content — a centred flex item
              is clipped on both sides once it outgrows the scroll container.
            */}
            <div
              className={`m-auto shrink-0 print:m-0 print:[width:auto] print:[height:auto] ${
                labelFootprint
                  ? "[width:calc(var(--label-w)*var(--label-zoom))] [height:calc(var(--label-h)*var(--label-zoom))]"
                  : ""
              }`}
              style={
                {
                  "--label-w": `${labelFootprint?.width ?? 0}px`,
                  "--label-h": `${labelFootprint?.height ?? 0}px`,
                  "--label-zoom": previewZoom,
                } as React.CSSProperties
              }
            >
              {/*
                `w-fit` is load-bearing, not cosmetic: a block-level wrapper
                would stretch to the scaler's *already zoomed* width and then be
                scaled again, so the magnified label would occupy zoom² of
                scrollable space (20504 px instead of 2608 px at 800%).
                Shrink-wrapping keeps the transform applied exactly once.
              */}
              <div
                ref={labelBoxRef}
                className="w-fit origin-top-left [transform:scale(var(--label-zoom))] print:[transform:none]"
              >
                <LabelPreview
                  label={previewLabel}
                  template={template}
                  format={format}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Batch Print Launcher Grid */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs print:hidden">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Batch Label Printing Studio
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate printable barcode label queues for entire catalog sections or storage racks.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 bg-muted/20 border border-border rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              <h4 className="text-sm font-bold text-foreground">
                Warehouse Location Tags
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Batch print shelf, bin, and drawer tags for all facility storage locations.
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={handleOpenBatchLocations}
              disabled={loading || locations.length === 0}
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Batch Print Location Tags ({locations.length})
            </Button>
          </div>

          <div className="p-5 bg-muted/20 border border-border rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-sky-500" />
              <h4 className="text-sm font-bold text-foreground">
                Component Catalog Labels
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Batch print barcodes and QR tags for all registered components in inventory.
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={handleOpenBatchComponents}
              disabled={loading || components.length === 0}
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Batch Print Component Labels ({components.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Global Quick Scan Modal */}
      <ScanDialog isOpen={isScanOpen} onClose={() => setIsScanOpen(false)} />

      {/* Batch Print Studio Modal */}
      <BatchPrintDialog
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        entityType={batchEntityType}
        entityIds={batchEntityIds}
      />
    </div>
  );
}
