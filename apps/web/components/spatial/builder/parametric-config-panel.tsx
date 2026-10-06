"use client";

import * as React from "react";
import {
  Box,
  Layers,
  Grid,
  RotateCcw,
  Sliders,
  Type,
  AlertCircle,
  Disc3,
  Wind,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  type ParametricStorageConfig,
  type ParametricTemplateType,
  type SmdDrawerCabinetConfig,
  type OpenBinMatrixConfig,
  type PalletRackConfig,
  type GridPartsTrayConfig,
  type ReelRackConfig,
  type DryCabinetConfig,
  PARAMETRIC_TEMPLATE_TYPES,
  BUILDER_PRESET_DEFINITIONS,
  SPATIAL_CATEGORY_DEFINITIONS,
  CANONICAL_SPATIAL_MODEL_DEFINITIONS,
  isTemplateRootCompatible,
} from "@ananya/inventory";
import { cn } from "@/lib/utils";

/** Naming pattern options; also used for the trigger tooltip when truncated. */
const NAMING_PATTERN_OPTIONS = [
  { value: "ROW_COL_ALPHA_NUM", label: "Alphanumeric (A01..Z99)" },
  { value: "ROW_COL_NUMERIC", label: "Row-Col (R1-C1)" },
  { value: "TIER_BIN_NUMERIC", label: "Tier-Bin (T1-B01)" },
  { value: "LEVEL_BAY_NUMERIC", label: "Level-Bay (L1-B1)" },
  { value: "SEQUENTIAL", label: "Sequential (001..999)" },
] as const;

const ROW_ORDER_OPTIONS = [
  {
    value: "top_to_bottom",
    label: "Top-to-Bottom (Row A at highest shelf/drawer)",
  },
  { value: "bottom_to_top", label: "Bottom-to-Top (Row A at ground level)" },
] as const;

export interface ParametricConfigPanelProps {
  config: ParametricStorageConfig;
  validationErrors: string[];
  onChangeConfig: (newConfig: ParametricStorageConfig) => void;
  onSelectTemplate: (templateType: ParametricTemplateType) => void;
  onResetBaseline: () => void;
  rootKind?: string | null;
  className?: string;
}

const PRESET_ICONS: Record<
  ParametricTemplateType,
  React.ComponentType<{ className?: string }>
> = {
  SMD_DRAWER_CABINET: Box,
  OPEN_BIN_MATRIX: Layers,
  PALLET_RACK: Sliders,
  GRID_PARTS_TRAY: Grid,
  REEL_RACK: Disc3,
  DRY_CABINET: Wind,
};

const TEMPLATE_OPTIONS = PARAMETRIC_TEMPLATE_TYPES.map((type) => ({
  type,
  icon: PRESET_ICONS[type],
}));

export function ParametricConfigPanel({
  config,
  validationErrors,
  onChangeConfig,
  onSelectTemplate,
  onResetBaseline,
  rootKind = null,
  className,
}: ParametricConfigPanelProps) {
  // Handlers for dimension inputs
  const handleDimensionChange = (
    field: "widthMm" | "heightMm" | "depthMm",
    valStr: string,
  ) => {
    const val = Number.parseFloat(valStr) || 0;
    onChangeConfig({
      ...config,
      dimensions: {
        ...config.dimensions,
        [field]: val,
      },
    });
  };

  const handleWallThicknessChange = (valStr: string) => {
    const val = Number.parseFloat(valStr) || 0;
    onChangeConfig({
      ...config,
      wallThicknessMm: val,
    });
  };

  // Subdivision handlers per template
  const handleGridChange = (
    field: "rows" | "columns" | "dividerThicknessMm",
    valStr: string,
  ) => {
    const isInteger = field !== "dividerThicknessMm";
    const val = isInteger
      ? Number.parseInt(valStr, 10) || 0
      : Number.parseFloat(valStr) || 0;

    const gridConfig = config as SmdDrawerCabinetConfig | GridPartsTrayConfig;
    onChangeConfig({
      ...gridConfig,
      [field]: val,
    });
  };

  const handleBinMatrixChange = (
    field: "tiers" | "binsPerTier" | "tierSpacingMm" | "binSpacingMm",
    valStr: string,
  ) => {
    const isInteger = field === "tiers" || field === "binsPerTier";
    const val = isInteger
      ? Number.parseInt(valStr, 10) || 0
      : Number.parseFloat(valStr) || 0;

    const binConfig = config as OpenBinMatrixConfig;
    onChangeConfig({
      ...binConfig,
      [field]: val,
    });
  };

  const handlePalletRackChange = (
    field: "levels" | "baysPerLevel" | "uprightPostWidthMm" | "beamHeightMm",
    valStr: string,
  ) => {
    const isInteger = field === "levels" || field === "baysPerLevel";
    const val = isInteger
      ? Number.parseInt(valStr, 10) || 0
      : Number.parseFloat(valStr) || 0;

    const rackConfig = config as PalletRackConfig;
    onChangeConfig({
      ...rackConfig,
      [field]: val,
    });
  };

  // Naming handlers
  const handleNamingChange = (
    updates: Partial<NonNullable<ParametricStorageConfig["naming"]>>,
  ) => {
    onChangeConfig({
      ...config,
      naming: {
        ...config.naming,
        ...updates,
      },
    });
  };

  // Full labels for the trigger tooltips: the selected value truncates with an
  // ellipsis in the narrow panel, so the complete text stays discoverable.
  const namingPatternValue = config.naming?.pattern ?? "ROW_COL_ALPHA_NUM";
  const namingPatternLabel =
    NAMING_PATTERN_OPTIONS.find((option) => option.value === namingPatternValue)
      ?.label ?? namingPatternValue;
  const rowOrderValue = config.naming?.rowOrder ?? "top_to_bottom";
  const rowOrderLabel =
    ROW_ORDER_OPTIONS.find((option) => option.value === rowOrderValue)?.label ??
    rowOrderValue;

  return (
    <div className={cn("space-y-6 text-sm", className)}>
      {/* 1. Builder Preset Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Builder Presets
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetBaseline}
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            title="Reset to clean baseline for diffing"
          >
            <RotateCcw className="size-3" />
            <span>Set As Baseline</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TEMPLATE_OPTIONS.map((tmpl) => {
            const Icon = tmpl.icon;
            const preset = BUILDER_PRESET_DEFINITIONS[tmpl.type];
            const rootCategory =
              SPATIAL_CATEGORY_DEFINITIONS[preset.rootCategory];
            const modelDefinition =
              CANONICAL_SPATIAL_MODEL_DEFINITIONS[
                preset.rootCategory as keyof typeof CANONICAL_SPATIAL_MODEL_DEFINITIONS
              ];
            const isSelected = config.templateType === tmpl.type;
            const isCompatible =
              !rootKind || isTemplateRootCompatible(tmpl.type, rootKind);
            return (
              <button
                key={tmpl.type}
                type="button"
                onClick={() => {
                  if (isCompatible) onSelectTemplate(tmpl.type);
                }}
                disabled={!isCompatible}
                aria-disabled={!isCompatible}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 text-left rounded-md border transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
                  isSelected
                    ? "bg-primary/5 border-primary text-primary font-medium shadow-xs"
                    : "bg-card border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "p-1.5 rounded",
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold leading-tight">
                    {preset.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    {preset.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 leading-snug">
                    Root: {rootCategory.displayName}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 leading-snug">
                    Model: {modelDefinition.displayName}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation Errors Banner */}
      {validationErrors.length > 0 && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>Invalid Configuration Parameters</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. Outer Container Dimensions */}
      <div className="space-y-3 p-3.5 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">
            Outer Dimensions (mm)
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {config.dimensions.widthMm} × {config.dimensions.heightMm} ×{" "}
            {config.dimensions.depthMm}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <Label
              htmlFor="param-width"
              className="text-[11px] text-muted-foreground"
            >
              Width
            </Label>
            <Input
              id="param-width"
              type="number"
              min={10}
              step={1}
              value={config.dimensions.widthMm || ""}
              onChange={(e) => handleDimensionChange("widthMm", e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="param-height"
              className="text-[11px] text-muted-foreground"
            >
              Height
            </Label>
            <Input
              id="param-height"
              type="number"
              min={10}
              step={1}
              value={config.dimensions.heightMm || ""}
              onChange={(e) =>
                handleDimensionChange("heightMm", e.target.value)
              }
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="param-depth"
              className="text-[11px] text-muted-foreground"
            >
              Depth
            </Label>
            <Input
              id="param-depth"
              type="number"
              min={10}
              step={1}
              value={config.dimensions.depthMm || ""}
              onChange={(e) => handleDimensionChange("depthMm", e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between gap-4">
          <Label
            htmlFor="param-wall-thickness"
            className="text-[11px] text-muted-foreground"
          >
            Wall / Carcass Thickness (mm)
          </Label>
          <Input
            id="param-wall-thickness"
            type="number"
            min={0}
            step={0.5}
            value={config.wallThicknessMm || 0}
            onChange={(e) => handleWallThicknessChange(e.target.value)}
            className="w-20 h-8 text-xs font-mono text-right"
          />
        </div>
      </div>

      {/* 3. Subdivision & Compartment Geometry */}
      <div className="space-y-3 p-3.5 rounded-lg border border-border bg-card">
        <span className="text-xs font-semibold text-foreground">
          Compartment Subdivisions
        </span>

        {/* SMD Drawer Cabinet & Grid Parts Tray */}
        {(config.templateType === "SMD_DRAWER_CABINET" ||
          config.templateType === "GRID_PARTS_TRAY") && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label
                  htmlFor="param-rows"
                  className="text-[11px] text-muted-foreground"
                >
                  Rows
                </Label>
                <Input
                  id="param-rows"
                  type="number"
                  min={1}
                  step={1}
                  value={(config as SmdDrawerCabinetConfig).rows || ""}
                  onChange={(e) => handleGridChange("rows", e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="param-columns"
                  className="text-[11px] text-muted-foreground"
                >
                  Columns
                </Label>
                <Input
                  id="param-columns"
                  type="number"
                  min={1}
                  step={1}
                  value={(config as SmdDrawerCabinetConfig).columns || ""}
                  onChange={(e) => handleGridChange("columns", e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-[11px] text-muted-foreground">
                Divider Thickness (mm)
              </Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={
                  (config as SmdDrawerCabinetConfig).dividerThicknessMm ??
                  (config.templateType === "GRID_PARTS_TRAY" ? 2 : 3)
                }
                onChange={(e) =>
                  handleGridChange("dividerThicknessMm", e.target.value)
                }
                className="w-20 h-8 text-xs font-mono text-right"
              />
            </div>
          </div>
        )}

        {/* Open Bin preset */}
        {config.templateType === "OPEN_BIN_MATRIX" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Tiers (Vertical)
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={(config as OpenBinMatrixConfig).tiers || ""}
                  onChange={(e) =>
                    handleBinMatrixChange("tiers", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Bins Per Tier
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={(config as OpenBinMatrixConfig).binsPerTier || ""}
                  onChange={(e) =>
                    handleBinMatrixChange("binsPerTier", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Tier Spacing (mm)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={(config as OpenBinMatrixConfig).tierSpacingMm ?? 10}
                  onChange={(e) =>
                    handleBinMatrixChange("tierSpacingMm", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Bin Spacing (mm)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={(config as OpenBinMatrixConfig).binSpacingMm ?? 6}
                  onChange={(e) =>
                    handleBinMatrixChange("binSpacingMm", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Pallet Rack */}
        {config.templateType === "PALLET_RACK" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Beam Levels
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={(config as PalletRackConfig).levels || ""}
                  onChange={(e) =>
                    handlePalletRackChange("levels", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Bays Per Level
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={(config as PalletRackConfig).baysPerLevel || ""}
                  onChange={(e) =>
                    handlePalletRackChange("baysPerLevel", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Upright Post (mm)
                </Label>
                <Input
                  type="number"
                  min={10}
                  step={5}
                  value={(config as PalletRackConfig).uprightPostWidthMm ?? 50}
                  onChange={(e) =>
                    handlePalletRackChange("uprightPostWidthMm", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Beam Height (mm)
                </Label>
                <Input
                  type="number"
                  min={10}
                  step={5}
                  value={(config as PalletRackConfig).beamHeightMm ?? 40}
                  onChange={(e) =>
                    handlePalletRackChange("beamHeightMm", e.target.value)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {config.templateType === "REEL_RACK" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Rows</Label>
                <Input type="number" min={1} step={1} value={(config as ReelRackConfig).rows || ""} onChange={(e) => onChangeConfig({ ...config, rows: Number.parseInt(e.target.value, 10) || 0 } as ReelRackConfig)} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Slots per row</Label>
                <Input type="number" min={1} step={1} value={(config as ReelRackConfig).columns || ""} onChange={(e) => onChangeConfig({ ...config, columns: Number.parseInt(e.target.value, 10) || 0 } as ReelRackConfig)} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Slot spacing (mm)</Label>
                <Input type="number" min={0} step={1} value={(config as ReelRackConfig).slotSpacingMm ?? 12} onChange={(e) => onChangeConfig({ ...config, slotSpacingMm: Number(e.target.value) } as ReelRackConfig)} className="h-8 text-xs font-mono" />
              </div>
            </div>
          </div>
        )}
        {config.templateType === "DRY_CABINET" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Direct child category</Label>
              <Select value={(config as DryCabinetConfig).childCategory} onValueChange={(value) => onChangeConfig({ ...config, childCategory: value as DryCabinetConfig["childCategory"] } as DryCabinetConfig)}>
                <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPATIAL_CATEGORY_DEFINITIONS[BUILDER_PRESET_DEFINITIONS.DRY_CABINET.rootCategory].allowedChildren.map((category) => (
                    <SelectItem key={category} value={category}>
                      {SPATIAL_CATEGORY_DEFINITIONS[category].displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Rows</Label><Input type="number" min={1} step={1} value={(config as DryCabinetConfig).rows || ""} onChange={(e) => onChangeConfig({ ...config, rows: Number.parseInt(e.target.value, 10) || 0 } as DryCabinetConfig)} className="h-8 text-xs font-mono" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Columns</Label><Input type="number" min={1} step={1} value={(config as DryCabinetConfig).columns || ""} onChange={(e) => onChangeConfig({ ...config, columns: Number.parseInt(e.target.value, 10) || 0 } as DryCabinetConfig)} className="h-8 text-xs font-mono" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Child spacing (mm)</Label><Input type="number" min={0} step={1} value={(config as DryCabinetConfig).childSpacingMm ?? 16} onChange={(e) => onChangeConfig({ ...config, childSpacingMm: Number(e.target.value) } as DryCabinetConfig)} className="h-8 text-xs font-mono" /></div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Compartment Naming & Identification */}
      <div className="space-y-3 p-3.5 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Type className="size-3.5 text-muted-foreground" />
          <span>Naming & Code Schemes</span>
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Naming Pattern
            </Label>
            <Select
              value={config.naming?.pattern ?? "ROW_COL_ALPHA_NUM"}
              onValueChange={(val) =>
                handleNamingChange({
                  pattern: val as NonNullable<
                    ParametricStorageConfig["naming"]
                  >["pattern"],
                })
              }
            >
              <SelectTrigger
                className="h-8 w-full min-w-0 text-xs"
                title={namingPatternLabel}
              >
                <SelectValue className="min-w-0 truncate" />
              </SelectTrigger>
              <SelectContent>
                {NAMING_PATTERN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Prefix (optional)
              </Label>
              <Input
                type="text"
                placeholder="e.g. DRW-"
                value={config.naming?.prefix ?? ""}
                onChange={(e) => handleNamingChange({ prefix: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Pad Digits
              </Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={config.naming?.padDigits ?? 2}
                onChange={(e) =>
                  handleNamingChange({
                    padDigits: Number.parseInt(e.target.value, 10) || 2,
                  })
                }
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Row Vertical Ordering
            </Label>
            <Select
              value={config.naming?.rowOrder ?? "top_to_bottom"}
              onValueChange={(val) =>
                handleNamingChange({
                  rowOrder: val as "top_to_bottom" | "bottom_to_top",
                })
              }
            >
              <SelectTrigger
                className="h-8 w-full min-w-0 text-xs"
                title={rowOrderLabel}
              >
                <SelectValue className="min-w-0 truncate" />
              </SelectTrigger>
              <SelectContent>
                {ROW_ORDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
