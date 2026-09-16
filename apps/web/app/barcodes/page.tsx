"use client";

import * as React from "react";
import {
  Scan,
  Printer,
  Boxes,
  MapPin,
  QrCode,
  Sparkles,
  Tag,
  Search,
  Check,
  ChevronDown,
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
import {
  LabelPreview,
  LabelTemplate,
} from "@/components/barcodes/label-preview";
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

const TEMPLATE_OPTIONS: Record<LabelTemplate, string> = {
  STANDARD: 'Standard (2" x 4")',
  COMPACT: 'Compact (1" x 2")',
  DETAILED: 'Detailed (3" x 4")',
  SHELF_BIN: "Shelf Bin Tag (3\" x 1.5\")",
};

const FORMAT_OPTIONS: Record<BarcodeFormat, string> = {
  CODE128: "Code 128 (High Density)",
  CODE39: "Code 39 (Alphanumeric)",
  EAN13: "EAN-13 (13 Digits)",
  UPCA: "UPC-A (12 Digits)",
};

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
          icon={Boxes}
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
                  <Boxes className="w-3.5 h-3.5 mr-1.5" />
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
                    {(template === "COMPACT" || template === "SHELF_BIN") && (
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">
                        (QR tag)
                      </span>
                    )}
                  </FieldLabel>
                  <Select
                    items={FORMAT_OPTIONS}
                    value={format}
                    disabled={template === "COMPACT" || template === "SHELF_BIN"}
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
                    disabled={template === "COMPACT" || template === "SHELF_BIN"}
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
              onClick={() => window.print()}
              disabled={labelLoading || !previewLabel}
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print Label
            </Button>
          </div>
        </div>

        {/* Live Vector Label Preview Container */}
        <div className="lg:col-span-6 bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center space-y-4 shadow-xs min-h-[360px] print:border-0 print:bg-transparent print:p-6 print:shadow-none print:min-h-0 print:items-start">
          <div className="w-full flex items-center justify-between print:hidden">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Live Label Preview
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {TEMPLATE_OPTIONS[template]}
            </span>
          </div>

          <div className="p-6 bg-muted/20 border border-border rounded-xl flex items-center justify-center w-full min-h-[260px] print:border-0 print:bg-transparent print:p-0 print:justify-start">
            <LabelPreview
              label={previewLabel}
              template={template}
              format={format}
            />
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
              <Boxes className="w-5 h-5 text-sky-500" />
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
