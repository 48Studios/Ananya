"use client";

import * as React from "react";
import {
  Anchor as AnchorIcon,
  Plus,
  Trash2,
  AlertTriangle,
  Move,
  RotateCw,
  Check,
  X,
  Loader2,
  Info,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailChip } from "@/components/ui/detail-field";
import type {
  SpatialAnchorDto,
  SpatialModelDto,
} from "@/lib/api/spatial-api";
import {
  validateAnchor,
  validateAnchorBounds,
  getAnchorDiff,
  type DraftAnchor,
} from "@/lib/spatial/spatial-anchor-authoring";
import type { SceneChildLayout } from "@/lib/spatial/spatial-3d-layout";

export interface SpatialAnchorEditorProps {
  model: SpatialModelDto;
  draftAnchors: DraftAnchor[];
  selectedAnchorId: string | null;
  initialAnchors: SpatialAnchorDto[];
  childrenLayout: SceneChildLayout[];
  onSelectAnchor: (anchorId: string | null) => void;
  onAddAnchor: () => void;
  onUpdateAnchor: (anchorId: string, updates: Partial<DraftAnchor>) => void;
  onDeleteAnchor: (anchorId: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  saveError?: string | null;
  authoringGizmoMode?: "translate" | "rotate";
  onGizmoModeChange?: (mode: "translate" | "rotate") => void;
  className?: string;
}

const COMMON_ANCHOR_TYPES = [
  "DRAWER",
  "BIN",
  "SHELF",
  "SLOT",
  "COMPARTMENT",
  "SURFACE",
];

export function SpatialAnchorEditor({
  model,
  draftAnchors,
  selectedAnchorId,
  initialAnchors,
  childrenLayout,
  onSelectAnchor,
  onAddAnchor,
  onUpdateAnchor,
  onDeleteAnchor,
  onSave,
  onCancel,
  saving = false,
  saveError,
  authoringGizmoMode = "translate",
  onGizmoModeChange,
  className,
}: SpatialAnchorEditorProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = React.useState(false);

  // Compute diff to determine dirty state
  const diff = React.useMemo(() => {
    return getAnchorDiff(initialAnchors, draftAnchors);
  }, [initialAnchors, draftAnchors]);

  // Find currently selected draft anchor
  const selectedAnchor = React.useMemo(() => {
    return draftAnchors.find((a) => a.id === selectedAnchorId) || null;
  }, [draftAnchors, selectedAnchorId]);

  // Map each anchor ID to any child location mapped to it
  const anchorOccupancyMap = React.useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const child of childrenLayout) {
      if (child.rawChild.anchor) {
        map.set(child.rawChild.anchor.id, {
          code: child.locationCode,
          name: child.locationName,
        });
      }
    }
    return map;
  }, [childrenLayout]);

  // Validate the selected anchor
  const selectedValidation = React.useMemo(() => {
    if (!selectedAnchor) return null;
    return validateAnchor(selectedAnchor, draftAnchors);
  }, [selectedAnchor, draftAnchors]);

  const selectedBounds = React.useMemo(() => {
    if (!selectedAnchor) return null;
    return validateAnchorBounds(selectedAnchor, model);
  }, [selectedAnchor, model]);

  // Handle Cancel click with guard if dirty
  const handleCancelClick = () => {
    if (diff.hasChanges) {
      setCancelConfirmOpen(true);
    } else {
      onCancel();
    }
  };

  const selectedOccupant = selectedAnchor
    ? anchorOccupancyMap.get(selectedAnchor.id)
    : undefined;

  return (
    <div
      className={`flex flex-col bg-card rounded-xl border border-border shadow-xs overflow-hidden ${
        className || ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-border/80 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AnchorIcon className="size-4" />
          </div>
          <div>
            <h3 className="font-semibold text-xs text-foreground uppercase tracking-wide">
              Anchor Authoring
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              {model.code} ({model.widthMm}x{model.heightMm}x{model.depthMm}mm)
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="xs"
          onClick={handleCancelClick}
          className="size-7 p-0 text-muted-foreground hover:text-foreground"
          title="Close Anchor Authoring"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Authoring Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2.5 bg-muted/15 border-b border-border/60">
        <Button
          type="button"
          variant="default"
          size="xs"
          onClick={onAddAnchor}
          className="h-7 text-xs gap-1.5 font-medium"
        >
          <Plus className="size-3.5" />
          <span>New Anchor</span>
        </Button>

        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/40">
          <Button
            type="button"
            variant={authoringGizmoMode === "translate" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => onGizmoModeChange?.("translate")}
            className="h-6 px-2 text-xs gap-1"
            title="Translate (Move) gizmo"
          >
            <Move className="size-3" />
            <span>Move</span>
          </Button>
          <Button
            type="button"
            variant={authoringGizmoMode === "rotate" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => onGizmoModeChange?.("rotate")}
            className="h-6 px-2 text-xs gap-1"
            title="Rotate gizmo"
          >
            <RotateCw className="size-3" />
            <span>Rotate</span>
          </Button>
        </div>
      </div>

      {/* Anchor Selector Dropdown */}
      <div className="px-3 py-2 border-b border-border/40 bg-card">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
          Select Anchor ({draftAnchors.length})
        </Label>
        <select
          value={selectedAnchorId || ""}
          onChange={(e) => onSelectAnchor(e.target.value || null)}
          className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background font-mono focus:outline-hidden focus:ring-1 focus:ring-ring"
        >
          <option value="">-- Choose an anchor to edit --</option>
          {draftAnchors.map((a) => {
            const occupant = anchorOccupancyMap.get(a.id);
            const statusSuffix = occupant
              ? ` → ${occupant.code}`
              : " (unassigned)";
            const tag = a.isNew ? " [New]" : "";
            return (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
                {statusSuffix}
                {tag}
              </option>
            );
          })}
        </select>
      </div>

      {/* Main Form or Unselected State */}
      <div className="p-3.5 space-y-4 max-h-[460px] overflow-y-auto">
        {selectedAnchor ? (
          <div className="space-y-3.5">
            {/* Occupancy Banner */}
            {selectedOccupant ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers className="size-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-900 dark:text-emerald-200 truncate">
                    Mapped to:{" "}
                    <strong className="font-mono">{selectedOccupant.code}</strong>
                  </span>
                </div>
                <DetailChip className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  Live Preview Active
                </DetailChip>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span>No child compartment currently assigned to this anchor.</span>
              </div>
            )}

            {/* Validation / Bounds Warning */}
            {selectedValidation && !selectedValidation.isValid && (
              <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1">
                {selectedValidation.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedBounds && !selectedBounds.withinBounds && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                <span>{selectedBounds.warning}</span>
              </div>
            )}

            {/* Core Identification */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Anchor Code</Label>
                <Input
                  value={selectedAnchor.code}
                  onChange={(e) =>
                    onUpdateAnchor(selectedAnchor.id, { code: e.target.value })
                  }
                  placeholder="e.g. A01"
                  className="h-7 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Anchor Type</Label>
                <select
                  value={selectedAnchor.anchorType}
                  onChange={(e) =>
                    onUpdateAnchor(selectedAnchor.id, {
                      anchorType: e.target.value,
                    })
                  }
                  className="w-full h-7 px-2 text-xs rounded-md border border-input bg-background font-mono focus:outline-hidden focus:ring-1 focus:ring-ring"
                >
                  {COMMON_ANCHOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-medium">Display Name</Label>
              <Input
                value={selectedAnchor.name}
                onChange={(e) =>
                  onUpdateAnchor(selectedAnchor.id, { name: e.target.value })
                }
                placeholder="e.g. Drawer A01"
                className="h-7 text-xs"
              />
            </div>

            {/* Numeric Coordinates (Position in mm) */}
            <div className="pt-2 border-t border-border/60">
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[11px] font-semibold text-foreground">
                  Position Coordinates (mm)
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Origin: {selectedAnchor.metadata?.origin === "center" ? "Center" : "Corner"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">X (W)</span>
                  <Input
                    type="number"
                    step="10"
                    value={selectedAnchor.localPositionX}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        localPositionX: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Y (H)</span>
                  <Input
                    type="number"
                    step="10"
                    value={selectedAnchor.localPositionY}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        localPositionY: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Z (D)</span>
                  <Input
                    type="number"
                    step="10"
                    value={selectedAnchor.localPositionZ}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        localPositionZ: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Numeric Rotation (degrees) */}
            <div className="pt-2 border-t border-border/60">
              <Label className="text-[11px] font-semibold text-foreground mb-1.5 block">
                Rotation Angles (degrees)
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Rot X</span>
                  <Input
                    type="number"
                    step="15"
                    value={selectedAnchor.localRotationX}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        localRotationX: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Rot Y</span>
                  <Input
                    type="number"
                    step="15"
                    value={selectedAnchor.localRotationY}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        localRotationY: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Rot Z</span>
                  <Input
                    type="number"
                    step="15"
                    value={selectedAnchor.localRotationZ}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        localRotationZ: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Bounding Dimensions (mm) */}
            <div className="pt-2 border-t border-border/60">
              <Label className="text-[11px] font-semibold text-foreground mb-1.5 block">
                Bounding Dimensions (mm)
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Width</span>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={selectedAnchor.boundingWidthMm ?? ""}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        boundingWidthMm: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                    placeholder="Auto"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Height</span>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={selectedAnchor.boundingHeightMm ?? ""}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        boundingHeightMm: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                    placeholder="Auto"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Depth</span>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={selectedAnchor.boundingDepthMm ?? ""}
                    onChange={(e) =>
                      onUpdateAnchor(selectedAnchor.id, {
                        boundingDepthMm: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                    placeholder="Auto"
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Delete Anchor Action */}
            <div className="pt-3 border-t border-border/60">
              <Button
                type="button"
                variant="destructive"
                size="xs"
                onClick={() => setDeleteConfirmOpen(true)}
                className="w-full text-xs gap-1.5"
              >
                <Trash2 className="size-3.5" />
                <span>Delete Anchor</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-2">
            <AnchorIcon className="size-8 text-muted-foreground/50 mx-auto" />
            <h4 className="font-medium text-xs text-foreground">
              No Anchor Selected
            </h4>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Click an anchor marker in the 3D viewport or select one above to
              reposition, rotate, or modify its bounding dimensions.
            </p>
          </div>
        )}
      </div>

      {/* Save Error Notification */}
      {saveError && (
        <div className="p-2.5 mx-3 mb-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Footer Actions */}
      <div className="p-3 bg-muted/40 border-t border-border/80 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          {diff.hasChanges ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Unsaved: {diff.added.length} added, {diff.updated.length} edited,{" "}
              {diff.deletedIds.length} removed
            </span>
          ) : (
            <span>All changes saved</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleCancelClick}
            disabled={saving}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="default"
            size="xs"
            onClick={onSave}
            disabled={!diff.hasChanges || saving}
            className="text-xs gap-1.5 font-medium"
          >
            {saving ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                <span>Save Anchors</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Confirm Discard Dialog */}
      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        onCancel={() => setCancelConfirmOpen(false)}
        title="Discard Unsaved Anchor Changes?"
        description="You have unsaved changes to spatial anchors on this model. Discarding will revert to persisted positions and cancel all drafts."
        confirmText="Discard Changes"
        variant="destructive"
        onConfirm={() => {
          setCancelConfirmOpen(false);
          onCancel();
        }}
      />

      {/* Confirm Delete Anchor Dialog */}
      {selectedAnchor && (
        <ConfirmDialog
          isOpen={deleteConfirmOpen}
          onCancel={() => setDeleteConfirmOpen(false)}
          title={`Delete Anchor "${selectedAnchor.code}"?`}
          description={
            selectedOccupant
              ? `Compartment "${selectedOccupant.code}" (${selectedOccupant.name}) is mapped to this anchor. Deleting this anchor will unassign the compartment from 3D space.`
              : `Are you sure you want to delete anchor "${selectedAnchor.code}"? This action cannot be undone once saved.`
          }
          confirmText="Delete Anchor"
          variant="destructive"
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            onDeleteAnchor(selectedAnchor.id);
          }}
        />
      )}
    </div>
  );
}
