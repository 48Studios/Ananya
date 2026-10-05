"use client";

import * as React from "react";
import { Plus, Trash2, Edit2, Loader2, Anchor as AnchorIcon, AlertCircle } from "lucide-react";
import { DialogShell, DialogShellBody } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  spatialApi,
  type SpatialModelDto,
  type SpatialAnchorDto,
  type CreateSpatialAnchorDto,
} from "@/lib/api/spatial-api";

export interface SpatialAnchorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: SpatialModelDto | null;
  onUpdated?: () => void;
}

const COMMON_ANCHOR_TYPES = ["SLOT", "SHELF", "BIN", "DRAWER", "COMPARTMENT", "SURFACE"];

export function SpatialAnchorsDialog({
  open,
  onOpenChange,
  model,
  onUpdated,
}: SpatialAnchorsDialogProps) {
  const [anchors, setAnchors] = React.useState<SpatialAnchorDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form state for adding/editing an anchor
  const [editingAnchorId, setEditingAnchorId] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [anchorType, setAnchorType] = React.useState("SLOT");
  const [posX, setPosX] = React.useState("0");
  const [posY, setPosY] = React.useState("0");
  const [posZ, setPosZ] = React.useState("0");
  const [boundingWidthMm, setBoundingWidthMm] = React.useState("");
  const [boundingHeightMm, setBoundingHeightMm] = React.useState("");
  const [boundingDepthMm, setBoundingDepthMm] = React.useState("");
  const [showAddForm, setShowAddForm] = React.useState(false);

  const fetchAnchors = React.useCallback(async (modelId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await spatialApi.getModelAnchors(modelId);
      setAnchors(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load anchors.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && model) {
      fetchAnchors(model.id);
      resetForm();
    }
  }, [open, model, fetchAnchors]);

  const resetForm = () => {
    setEditingAnchorId(null);
    setCode("");
    setName("");
    setAnchorType("SLOT");
    setPosX("0");
    setPosY("0");
    setPosZ("0");
    setBoundingWidthMm("");
    setBoundingHeightMm("");
    setBoundingDepthMm("");
    setShowAddForm(false);
    setError(null);
  };

  const handleStartEdit = (anchor: SpatialAnchorDto) => {
    setEditingAnchorId(anchor.id);
    setCode(anchor.code);
    setName(anchor.name);
    setAnchorType(anchor.anchorType || "SLOT");
    setPosX(String(anchor.localPositionX ?? 0));
    setPosY(String(anchor.localPositionY ?? 0));
    setPosZ(String(anchor.localPositionZ ?? 0));
    setBoundingWidthMm(anchor.boundingWidthMm != null ? String(anchor.boundingWidthMm) : "");
    setBoundingHeightMm(anchor.boundingHeightMm != null ? String(anchor.boundingHeightMm) : "");
    setBoundingDepthMm(anchor.boundingDepthMm != null ? String(anchor.boundingDepthMm) : "");
    setShowAddForm(true);
    setError(null);
  };

  const handleDelete = async (anchorId: string) => {
    if (!model) return;
    if (!confirm("Are you sure you want to delete this anchor?")) return;

    setActionLoading(true);
    setError(null);
    try {
      await spatialApi.deleteAnchor(anchorId);
      await fetchAnchors(model.id);
      if (editingAnchorId === anchorId) {
        resetForm();
      }
      onUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete anchor.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAnchor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model) return;
    setError(null);

    if (!code.trim()) {
      setError("Anchor code is required (e.g. A01).");
      return;
    }
    if (!name.trim()) {
      setError("Anchor name is required.");
      return;
    }

    const px = parseFloat(posX);
    const py = parseFloat(posY);
    const pz = parseFloat(posZ);

    if (isNaN(px) || isNaN(py) || isNaN(pz)) {
      setError("Coordinates (X, Y, Z) must be valid numbers in millimeters.");
      return;
    }

    const bw = boundingWidthMm.trim() ? parseFloat(boundingWidthMm) : null;
    const bh = boundingHeightMm.trim() ? parseFloat(boundingHeightMm) : null;
    const bd = boundingDepthMm.trim() ? parseFloat(boundingDepthMm) : null;

    if (
      (bw != null && (isNaN(bw) || bw <= 0)) ||
      (bh != null && (isNaN(bh) || bh <= 0)) ||
      (bd != null && (isNaN(bd) || bd <= 0))
    ) {
      setError("Bounding dimensions must be positive numbers in millimeters.");
      return;
    }

    const payload: CreateSpatialAnchorDto = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      anchorType: anchorType.trim().toUpperCase(),
      localPositionX: px,
      localPositionY: py,
      localPositionZ: pz,
      boundingWidthMm: bw,
      boundingHeightMm: bh,
      boundingDepthMm: bd,
    };

    setActionLoading(true);
    try {
      if (editingAnchorId) {
        await spatialApi.updateAnchor(editingAnchorId, payload);
      } else {
        await spatialApi.createAnchor(model.id, payload);
      }
      await fetchAnchors(model.id);
      resetForm();
      onUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save anchor.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!model) return null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Anchors: ${model.code} (${model.name})`}
      description={`Manage compartment snap targets and physical coordinate slots for this model (Model dimensions: ${model.widthMm} × ${model.heightMm} × ${model.depthMm} mm).`}
      size="lg"
    >
      <DialogShellBody className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">
            {anchors.length} {anchors.length === 1 ? "Anchor configured" : "Anchors configured"}
          </div>
          {!showAddForm && (
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              disabled={actionLoading}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Anchor
            </Button>
          )}
        </div>

        {/* Add / Edit Form */}
        {showAddForm && (
          <form
            onSubmit={handleSaveAnchor}
            className="p-4 rounded-lg border border-border bg-muted/40 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                {editingAnchorId ? `Edit Anchor: ${code}` : "New Spatial Anchor"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetForm}
                disabled={actionLoading}
              >
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="anchor-code" className="text-xs">
                  Code *
                </Label>
                <Input
                  id="anchor-code"
                  placeholder="e.g. A01"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={actionLoading}
                  className="font-mono uppercase text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="anchor-name" className="text-xs">
                  Name *
                </Label>
                <Input
                  id="anchor-name"
                  placeholder="e.g. Slot A01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={actionLoading}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="anchor-type" className="text-xs">
                  Type
                </Label>
                <select
                  id="anchor-type"
                  value={anchorType}
                  onChange={(e) => setAnchorType(e.target.value)}
                  disabled={actionLoading}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {COMMON_ANCHOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Position Coordinates in mm */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Local Position Offset (relative to model origin, in mm)
              </Label>
              <div className="grid grid-cols-3 gap-3 mt-1">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">X (mm)</span>
                  <Input
                    type="number"
                    step="any"
                    value={posX}
                    onChange={(e) => setPosX(e.target.value)}
                    disabled={actionLoading}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Y (mm)</span>
                  <Input
                    type="number"
                    step="any"
                    value={posY}
                    onChange={(e) => setPosY(e.target.value)}
                    disabled={actionLoading}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Z (mm)</span>
                  <Input
                    type="number"
                    step="any"
                    value={posZ}
                    onChange={(e) => setPosZ(e.target.value)}
                    disabled={actionLoading}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Bounding Box in mm (optional) */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Bounding Dimensions (optional compartment size, in mm)
              </Label>
              <div className="grid grid-cols-3 gap-3 mt-1">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Width (mm)</span>
                  <Input
                    type="number"
                    placeholder="Width"
                    step="any"
                    value={boundingWidthMm}
                    onChange={(e) => setBoundingWidthMm(e.target.value)}
                    disabled={actionLoading}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Height (mm)</span>
                  <Input
                    type="number"
                    placeholder="Height"
                    step="any"
                    value={boundingHeightMm}
                    onChange={(e) => setBoundingHeightMm(e.target.value)}
                    disabled={actionLoading}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Depth (mm)</span>
                  <Input
                    type="number"
                    placeholder="Depth"
                    step="any"
                    value={boundingDepthMm}
                    onChange={(e) => setBoundingDepthMm(e.target.value)}
                    disabled={actionLoading}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetForm}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {editingAnchorId ? "Update Anchor" : "Add Anchor"}
              </Button>
            </div>
          </form>
        )}

        {/* Anchors Table */}
        <div className="rounded-md border border-border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading anchors...
            </div>
          ) : anchors.length === 0 ? (
            <div className="text-center p-8 text-sm text-muted-foreground">
              <AnchorIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No spatial anchors defined for this model yet.</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                Anchors allow child locations (drawers, shelves, bins) to snap into designated slots.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Code</th>
                  <th className="py-2.5 px-3 font-semibold">Name</th>
                  <th className="py-2.5 px-3 font-semibold">Type</th>
                  <th className="py-2.5 px-3 font-semibold font-mono">Position (X, Y, Z mm)</th>
                  <th className="py-2.5 px-3 font-semibold font-mono">Bounds (W × H × D mm)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {anchors.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium">{a.code}</td>
                    <td className="py-2.5 px-3 text-foreground">{a.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted border border-border">
                        {a.anchorType || "SLOT"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">
                      ({a.localPositionX ?? 0}, {a.localPositionY ?? 0}, {a.localPositionZ ?? 0})
                    </td>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">
                      {a.boundingWidthMm != null || a.boundingHeightMm != null || a.boundingDepthMm != null
                        ? `${a.boundingWidthMm ?? "—"} × ${a.boundingHeightMm ?? "—"} × ${a.boundingDepthMm ?? "—"}`
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Edit Anchor"
                          onClick={() => handleStartEdit(a)}
                          disabled={actionLoading}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Delete Anchor"
                          onClick={() => handleDelete(a.id)}
                          disabled={actionLoading}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive/80" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogShellBody>
    </DialogShell>
  );
}
