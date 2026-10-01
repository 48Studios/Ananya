"use client";

import * as React from "react";
import { Box, Loader2 } from "lucide-react";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellCancelButton,
} from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  spatialApi,
  type SpatialModelDto,
  type CreateSpatialModelDto,
} from "@/lib/api/spatial-api";

export interface SpatialModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model?: SpatialModelDto | null;
  onSuccess: (savedModel: SpatialModelDto) => void;
}

export function SpatialModelDialog({
  open,
  onOpenChange,
  model,
  onSuccess,
}: SpatialModelDialogProps) {
  const isEditing = Boolean(model);

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [format, setFormat] = React.useState("PROCEDURAL");
  const [widthMm, setWidthMm] = React.useState("1000");
  const [heightMm, setHeightMm] = React.useState("1000");
  const [depthMm, setDepthMm] = React.useState("400");
  const [isActive, setIsActive] = React.useState(true);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (model) {
      setCode(model.code);
      setName(model.name);
      setDescription(
        typeof model.metadata?.description === "string"
          ? model.metadata.description
          : "",
      );
      setFormat(model.format || "PROCEDURAL");
      setWidthMm(String(model.widthMm ?? 1000));
      setHeightMm(String(model.heightMm ?? 1000));
      setDepthMm(String(model.depthMm ?? 400));
      setIsActive(model.isActive ?? true);
    } else {
      setCode("");
      setName("");
      setDescription("");
      setFormat("PROCEDURAL");
      setWidthMm("1000");
      setHeightMm("1000");
      setDepthMm("400");
      setIsActive(true);
    }
    setError(null);
  }, [model, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const w = parseFloat(widthMm);
    const h = parseFloat(heightMm);
    const d = parseFloat(depthMm);

    if (!code.trim()) {
      setError("Model code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Model name is required.");
      return;
    }
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0 || isNaN(d) || d <= 0) {
      setError("Dimensions (width, height, depth) must be positive millimeters.");
      return;
    }

    setLoading(true);
    try {
      const payload: CreateSpatialModelDto = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        format,
        widthMm: w,
        heightMm: h,
        depthMm: d,
        isActive,
        metadata: description.trim() ? { description: description.trim() } : {},
      };

      let result: SpatialModelDto;
      if (isEditing && model) {
        result = await spatialApi.updateModel(model.id, payload);
      } else {
        result = await spatialApi.createModel(payload);
      }

      onSuccess(result);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save spatial model.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Box className="size-5 text-primary" />}
      title={isEditing ? `Edit Spatial Model (${model?.code})` : "Create Spatial Model"}
      description="Define a physical geometry container template (dimensions in millimeters)."
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogShellBody className="space-y-4">
          {error && (
            <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="model-code" className="text-xs">
                Model Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="model-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CAB-60D, RACK-01"
                disabled={isEditing || loading}
                className="font-mono text-xs uppercase"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model-name" className="text-xs">
                Model Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="model-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 60-Drawer Component Cabinet"
                disabled={loading}
                className="text-xs"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="model-format" className="text-xs">
                Format
              </Label>
              <select
                id="model-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                disabled={loading}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="PROCEDURAL">Procedural 2D Matrix</option>
                <option value="GLB">GLB (Binary glTF)</option>
                <option value="GLTF">glTF JSON</option>
                <option value="SVG">SVG Vector</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model-active" className="text-xs">
                Status
              </Label>
              <div className="flex items-center h-9 gap-2">
                <input
                  id="model-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={loading}
                  className="size-4 rounded border-input"
                />
                <span className="text-xs text-muted-foreground">Active for Location Assignment</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Bounding Dimensions (in millimeters)
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">
                  Width (X mm)
                </span>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                  placeholder="1000"
                  disabled={loading}
                  className="font-mono text-xs"
                  required
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">
                  Height (Y mm)
                </span>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  value={heightMm}
                  onChange={(e) => setHeightMm(e.target.value)}
                  placeholder="1000"
                  disabled={loading}
                  className="font-mono text-xs"
                  required
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">
                  Depth (Z mm)
                </span>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  value={depthMm}
                  onChange={(e) => setDepthMm(e.target.value)}
                  placeholder="400"
                  disabled={loading}
                  className="font-mono text-xs"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model-desc" className="text-xs">
              Description / Notes (Optional)
            </Label>
            <Input
              id="model-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Standard Raaco 60-drawer SMD component storage unit"
              disabled={loading}
              className="text-xs"
            />
          </div>
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton disabled={loading} onClick={() => onOpenChange(false)} />
          <Button type="submit" size="sm" disabled={loading} className="gap-1.5">
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            <span>{isEditing ? "Save Changes" : "Create Model"}</span>
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
