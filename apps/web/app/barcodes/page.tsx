"use client";

import * as React from "react";
import { Scan, Printer, Boxes, MapPin, QrCode, Sparkles } from "lucide-react";
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
import { BarcodeFormat, LabelData, EntityType } from "@/lib/api/barcodes-api";
import { componentsApi, ComponentDto } from "@/lib/api/components-api";
import { locationsApi, LocationDto } from "@/lib/api/locations-api";

export default function BarcodesHubPage() {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [isScanOpen, setIsScanOpen] = React.useState(false);
  const [isBatchOpen, setIsBatchOpen] = React.useState(false);
  const [batchEntityType, setBatchEntityType] =
    React.useState<EntityType>("COMPONENT");
  const [batchEntityIds, setBatchEntityIds] = React.useState<string[]>([]);

  // Generator State
  const [sampleCode, setSampleCode] = React.useState("ANANYA-INV-2026");
  const [sampleQr, setSampleQr] = React.useState(
    "ANANYA:V1:COMPONENT:demo-id-123",
  );
  const [format, setFormat] = React.useState<BarcodeFormat>("CODE128");
  const [template, setTemplate] = React.useState<LabelTemplate>("STANDARD");

  React.useEffect(() => {
    Promise.all([
      componentsApi.getAll().catch(() => []),
      locationsApi.getAll().catch(() => []),
    ])
      .then(([comps, locs]) => {
        setComponents(comps);
        setLocations(locs);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeComponent = components[0];

  const sampleLabel: LabelData = {
    id: activeComponent?.id || "sys-preview",
    entityType: "COMPONENT",
    primaryCode: sampleCode || activeComponent?.sku || "INV-ITEM-001",
    qrPayload:
      sampleQr || `ANANYA:V1:COMPONENT:${activeComponent?.id || "sys-preview"}`,
    title: activeComponent?.name || "Inventory Item Label",
    subtitle: `SKU: ${activeComponent?.sku || "N/A"} | Location: ${locations[0]?.name || "Unassigned"}`,
  };

  const handleOpenBatchComponents = () => {
    setBatchEntityType("COMPONENT");
    setBatchEntityIds(components.slice(0, 10).map((c) => c.id));
    setIsBatchOpen(true);
  };

  const handleOpenBatchLocations = () => {
    setBatchEntityType("LOCATION");
    setBatchEntityIds(locations.slice(0, 10).map((l) => l.id));
    setIsBatchOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Barcode & QR Operations Studio"
        description="Barcode generation, versioned QR code payloads, hardware scanner lookup, and printable label templates."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsScanOpen(true)}
            >
              <Scan className="w-4 h-4 mr-1.5" />
              Quick Scan
            </Button>
            <Button size="sm" onClick={handleOpenBatchComponents}>
              <Printer className="w-4 h-4 mr-1.5" />
              Batch Print Studio
            </Button>
          </div>
        }
      />

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Printable Components"
          value={components.length}
          subtitle="Catalog component labels"
          icon={Boxes}
        />
        <StatCard
          title="Printable Locations"
          value={locations.length}
          subtitle="Shelf & Bin location tags"
          icon={MapPin}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Generator Controls & Live Vector Preview */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">
              Barcode & QR Generator Studio
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Input custom codes and configure label formats for instant vector
              preview.
            </p>
          </div>

          <div className="space-y-3">
            <Field>
              <FieldLabel className="text-xs">Primary Barcode Input</FieldLabel>
              <Input
                type="text"
                value={sampleCode}
                onChange={(e) => setSampleCode(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs">
                Structured QR Payload Input
              </FieldLabel>
              <Input
                type="text"
                value={sampleQr}
                onChange={(e) => setSampleQr(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs">Barcode Symbology</FieldLabel>
                <Select
                  value={format}
                  onValueChange={(val) => setFormat(val as BarcodeFormat)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CODE128">
                      Code 128 (High Density)
                    </SelectItem>
                    <SelectItem value="CODE39">
                      Code 39 (Alphanumeric)
                    </SelectItem>
                    <SelectItem value="EAN13">EAN-13 (13 Digits)</SelectItem>
                    <SelectItem value="UPCA">UPC-A (12 Digits)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel className="text-xs">Label Template</FieldLabel>
                <Select
                  value={template}
                  onValueChange={(val) => setTemplate(val as LabelTemplate)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">
                      Standard (2&quot; x 4&quot;)
                    </SelectItem>
                    <SelectItem value="COMPACT">
                      Compact (1&quot; x 2&quot;)
                    </SelectItem>
                    <SelectItem value="DETAILED">
                      Detailed (3&quot; x 4&quot;)
                    </SelectItem>
                    <SelectItem value="SHELF_BIN">Shelf Bin Tag</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">
              Live Vector Rendering
            </span>
            <Button size="xs" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print Test Label
            </Button>
          </div>
        </div>

        {/* Live Vector Label Preview */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center space-y-4 shadow-xs min-h-[360px]">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Live Label Template Preview
          </span>
          <div className="p-4 bg-muted/20 border border-border rounded-xl flex items-center justify-center w-full">
            <LabelPreview
              label={sampleLabel}
              template={template}
              format={format}
            />
          </div>
        </div>
      </div>

      {/* Batch Print Launcher Grid */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Batch Label Printing Studio
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate printable barcode label queues for entire catalog
              categories or storage sections.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 bg-muted/20 border border-border rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-sky-500" />
              <h4 className="text-sm font-bold text-foreground">
                Component Catalog Labels
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Batch print barcodes and QR tags for all registered components in
              inventory.
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

          <div className="p-5 bg-muted/20 border border-border rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              <h4 className="text-sm font-bold text-foreground">
                Warehouse Location Tags
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Batch print shelf, bin, and drawer tags for all facility storage
              locations.
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
