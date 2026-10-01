"use client";

import * as React from "react";
import {
  Box,
  Anchor as AnchorIcon,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Save,
  Grid,
  Info,
} from "lucide-react";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  spatialApi,
  type LocationMappingContextDto,
  type CreateSpatialNodeDto,
  type UpdateSpatialNodeDto,
} from "@/lib/api/spatial-api";

export interface SpatialMappingDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type TabType = "node" | "children" | "preview";

export function SpatialMappingDialog({
  locationId,
  open,
  onOpenChange,
  onSuccess,
}: SpatialMappingDialogProps) {
  const [context, setContext] = React.useState<LocationMappingContextDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const [activeTab, setActiveTab] = React.useState<TabType>("node");

  // Location spatial node form state
  const [selectedModelId, setSelectedModelId] = React.useState<string>("");
  const [selectedParentAnchorId, setSelectedParentAnchorId] = React.useState<string>("");
  const [posX, setPosX] = React.useState("0");
  const [posY, setPosY] = React.useState("0");
  const [posZ, setPosZ] = React.useState("0");
  const [rotY, setRotY] = React.useState("0");

  // Child mapping inline selection: map of childLocationId -> selectedAnchorId
  const [childAnchorMap, setChildAnchorMap] = React.useState<Record<string, string>>({});

  const fetchContext = React.useCallback(async (locId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await spatialApi.getLocationMappingContext(locId);
      setContext(data);

      // Initialize form from context
      if (data.node) {
        setSelectedModelId(data.node.modelId || "");
        setSelectedParentAnchorId(data.node.anchorId || "");
        setPosX(String(data.node.positionX ?? 0));
        setPosY(String(data.node.positionY ?? 0));
        setPosZ(String(data.node.positionZ ?? 0));
        setRotY(String(data.node.rotationY ?? 0));
      } else {
        setSelectedModelId("");
        setSelectedParentAnchorId("");
        setPosX("0");
        setPosY("0");
        setPosZ("0");
        setRotY("0");
      }

      // Initialize child anchor selections
      const initialChildMap: Record<string, string> = {};
      data.children.forEach((c) => {
        if (c.anchor) {
          initialChildMap[c.location.id] = c.anchor.id;
        }
      });
      setChildAnchorMap(initialChildMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load spatial mapping context.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && locationId) {
      fetchContext(locationId);
      setSuccessMessage(null);
      setError(null);
    }
  }, [open, locationId, fetchContext]);

  // Handle saving the current location's SpatialNode
  const handleSaveLocationNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context) return;
    setError(null);
    setSuccessMessage(null);

    const px = parseFloat(posX);
    const py = parseFloat(posY);
    const pz = parseFloat(posZ);
    const ry = parseFloat(rotY);

    if (isNaN(px) || isNaN(py) || isNaN(pz) || isNaN(ry)) {
      setError("Coordinates and rotation must be valid numbers (mm / degrees).");
      return;
    }

    const parentNodeId = context.parentSpatialNode?.id ?? null;
    const modelId = selectedModelId.trim() ? selectedModelId : null;
    const anchorId = selectedParentAnchorId.trim() ? selectedParentAnchorId : null;

    setActionLoading(true);
    try {
      if (context.node) {
        const updatePayload: UpdateSpatialNodeDto = {
          modelId,
          parentSpatialNodeId: parentNodeId,
          anchorId,
          positionX: px,
          positionY: py,
          positionZ: pz,
          rotationY: ry,
        };
        await spatialApi.updateNode(context.node.id, updatePayload);
        setSuccessMessage("Spatial node updated successfully.");
      } else {
        const createPayload: CreateSpatialNodeDto = {
          locationId: context.location.id,
          modelId,
          parentSpatialNodeId: parentNodeId,
          anchorId,
          positionX: px,
          positionY: py,
          positionZ: pz,
          rotationY: ry,
        };
        await spatialApi.createNode(createPayload);
        setSuccessMessage("Spatial node created and mapped successfully.");
      }
      await fetchContext(context.location.id);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save spatial node.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle unmapping (deleting) current location's spatial node
  const handleUnmapLocation = async () => {
    if (!context?.node) return;
    if (context.children.some((c) => c.isMapped)) {
      setError(
        "Cannot unmap this location while child locations are mapped to it. Unmap child locations first.",
      );
      return;
    }
    if (
      !confirm(
        `Are you sure you want to remove the spatial mapping for "${context.location.code}"? The physical location itself will not be changed.`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await spatialApi.deleteNode(context.node.id);
      setSuccessMessage("Spatial mapping removed.");
      await fetchContext(context.location.id);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unmap location.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle mapping a child location to an anchor
  const handleMapChildAnchor = async (childLocationId: string) => {
    if (!context?.node) {
      setError("Please save this location's spatial model first.");
      return;
    }

    const anchorId = childAnchorMap[childLocationId];
    if (!anchorId) {
      setError("Please select an anchor to assign to the child location.");
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const childItem = context.children.find((c) => c.location.id === childLocationId);
      if (childItem?.node) {
        await spatialApi.updateNode(childItem.node.id, {
          anchorId,
          parentSpatialNodeId: context.node.id,
        });
      } else {
        await spatialApi.createNode({
          locationId: childLocationId,
          parentSpatialNodeId: context.node.id,
          anchorId,
        });
      }
      setSuccessMessage(`Child location mapped to anchor successfully.`);
      await fetchContext(context.location.id);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to map child location.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle unmapping a child location
  const handleUnmapChild = async (childNodeId: string) => {
    if (!confirm("Are you sure you want to unmap this child location?")) return;
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await spatialApi.deleteNode(childNodeId);
      setSuccessMessage("Child location unmapped.");
      await fetchContext(locationId);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unmap child location.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!open) return null;

  // Occupied anchors on the current location's model (by child locations)
  const childOccupiedAnchorIds = new Set<string>();
  context?.children.forEach((c) => {
    if (c.anchor) {
      childOccupiedAnchorIds.add(c.anchor.id);
    }
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Spatial Mapping: ${context?.location.code ?? "Loading..."}`}
      description="Configure physical model, parent attachment anchor, and child compartment mappings."
      size="xl"
    >
      <div className="space-y-4">
        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 p-3 text-sm text-foreground bg-muted border border-border rounded-md">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex border-b border-border space-x-1">
          <button
            type="button"
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "node"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("node")}
          >
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5" />
              This Location
              {context?.node ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </div>
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "children"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("children")}
          >
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Child Locations & Anchors
              {context && (
                <span className="text-[10px] px-1 rounded bg-muted font-mono">
                  {context.children.filter((c) => c.isMapped).length}/{context.children.length}
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "preview"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("preview")}
          >
            <div className="flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5" />
              2D Layout Preview
            </div>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading mapping context...
          </div>
        ) : !context ? null : (
          <div>
            {/* TAB 1: This Location */}
            {activeTab === "node" && (
              <form onSubmit={handleSaveLocationNode} className="space-y-4">
                <div className="p-3 bg-muted/30 border border-border rounded-md text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      Physical Location: {context.location.code} ({context.location.name})
                    </span>
                    <span className="text-muted-foreground capitalize">
                      Kind: {context.location.kind}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Parent:{" "}
                    {context.parentLocation
                      ? `${context.parentLocation.code} (${context.parentLocation.name})`
                      : "Top Level"}
                  </div>
                </div>

                {/* Spatial Model Selection */}
                <div className="space-y-1.5">
                  <Label htmlFor="model-select" className="text-xs font-medium">
                    Spatial Model (Geometry & Anchors)
                  </Label>
                  <select
                    id="model-select"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={actionLoading}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">None (Unmapped / Abstract)</option>
                    {context.availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.name} ({m.widthMm} × {m.heightMm} × {m.depthMm} mm,{" "}
                        {Array.isArray(m.anchors) ? m.anchors.length : 0} anchors)
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Select a spatial template defining this storage unit&apos;s physical bounding box
                    and compartment anchor slots.
                  </p>
                </div>

                {/* Attachment to Parent */}
                {context.parentLocation && (
                  <div className="p-3 border border-border rounded-md space-y-3 bg-muted/20">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <AnchorIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      Attachment to Parent: {context.parentLocation.code}
                    </div>

                    {context.parentSpatialNode && context.parentModel ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="parent-anchor-select" className="text-xs">
                          Snap to Parent Anchor (Model: {context.parentModel.code})
                        </Label>
                        <select
                          id="parent-anchor-select"
                          value={selectedParentAnchorId}
                          onChange={(e) => setSelectedParentAnchorId(e.target.value)}
                          disabled={actionLoading}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">None / Custom Explicit Position</option>
                          {context.parentAnchors.map((pa) => {
                            const occupied = context.parentAnchorOccupancy.find(
                              (occ) =>
                                occ.anchorId === pa.id &&
                                occ.occupiedByLocationId !== context.location.id,
                            );
                            return (
                              <option
                                key={pa.id}
                                value={pa.id}
                                disabled={Boolean(occupied)}
                              >
                                {pa.code} ({pa.name})
                                {occupied
                                  ? ` — Occupied by ${occupied.occupiedByLocationCode}`
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Parent location {context.parentLocation.code} does not have a spatial model
                        with anchors. Position will be relative to parent origin.
                      </p>
                    )}

                    {/* Explicit Coordinates */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">
                        Relative Offset Coordinates (mm) & Rotation
                      </Label>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        <div>
                          <span className="text-[10px] text-muted-foreground">X (mm)</span>
                          <Input
                            type="number"
                            step="any"
                            value={posX}
                            onChange={(e) => setPosX(e.target.value)}
                            disabled={actionLoading || Boolean(selectedParentAnchorId)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Y (mm)</span>
                          <Input
                            type="number"
                            step="any"
                            value={posY}
                            onChange={(e) => setPosY(e.target.value)}
                            disabled={actionLoading || Boolean(selectedParentAnchorId)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Z (mm)</span>
                          <Input
                            type="number"
                            step="any"
                            value={posZ}
                            onChange={(e) => setPosZ(e.target.value)}
                            disabled={actionLoading || Boolean(selectedParentAnchorId)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Rot Y (deg)</span>
                          <Input
                            type="number"
                            step="any"
                            value={rotY}
                            onChange={(e) => setRotY(e.target.value)}
                            disabled={actionLoading}
                            className="font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  {context.node ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleUnmapLocation}
                      disabled={actionLoading}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Unmap Location
                    </Button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenChange(false)}
                      disabled={actionLoading}
                    >
                      Close
                    </Button>
                    <Button type="submit" size="sm" disabled={actionLoading}>
                      {actionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {context.node ? "Update Spatial Node" : "Save Spatial Node"}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: Child Locations & Anchors */}
            {activeTab === "children" && (
              <div className="space-y-4">
                {!context.node ? (
                  <div className="p-4 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Spatial Node Not Configured</p>
                      <p className="mt-0.5">
                        Please configure and save this location&apos;s Spatial Model in the &quot;This
                        Location&quot; tab first before mapping child locations.
                      </p>
                    </div>
                  </div>
                ) : context.modelAnchors.length === 0 ? (
                  <div className="p-4 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">No Model Anchors Configured</p>
                      <p className="mt-0.5">
                        The selected spatial model ({context.model?.code}) does not have any anchors
                        defined. Configure anchors in the Spatial Models page to snap child locations.
                      </p>
                    </div>
                  </div>
                ) : context.children.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    This location has no child locations to map.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Map child storage compartments to anchor slots of model{" "}
                        <strong className="text-foreground">{context.model?.code}</strong>.
                      </span>
                      <span>
                        {context.children.filter((c) => c.isMapped).length} of{" "}
                        {context.children.length} mapped
                      </span>
                    </div>

                    <div className="rounded-md border border-border overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold">Child Location</th>
                            <th className="py-2.5 px-3 font-semibold">Kind</th>
                            <th className="py-2.5 px-3 font-semibold">Status</th>
                            <th className="py-2.5 px-3 font-semibold">Assign Anchor</th>
                            <th className="py-2.5 px-3 text-right font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {context.children.map((child) => {
                            const isAssigned = child.isMapped && child.anchor;
                            const selectedAnchorId =
                              childAnchorMap[child.location.id] || (child.anchor?.id ?? "");

                            return (
                              <tr key={child.location.id} className="hover:bg-muted/30">
                                <td className="py-2 px-3">
                                  <div className="font-mono font-medium text-foreground">
                                    {child.location.code}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {child.location.name}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-muted-foreground capitalize">
                                  {child.location.kind}
                                </td>
                                <td className="py-2 px-3">
                                  {isAssigned ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      Anchor: {child.anchor?.code}
                                    </span>
                                  ) : child.isMapped ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                      Mapped (Offset)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                      Unmapped
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <select
                                    value={selectedAnchorId}
                                    onChange={(e) =>
                                      setChildAnchorMap((prev) => ({
                                        ...prev,
                                        [child.location.id]: e.target.value,
                                      }))
                                    }
                                    disabled={actionLoading}
                                    className="w-full max-w-[200px] h-8 rounded border border-input bg-background px-2 py-0.5 text-xs shadow-sm focus:outline-none"
                                  >
                                    <option value="">Select Anchor...</option>
                                    {context.modelAnchors.map((a) => {
                                      const isOccupiedByOther =
                                        childOccupiedAnchorIds.has(a.id) &&
                                        child.anchor?.id !== a.id;
                                      return (
                                        <option
                                          key={a.id}
                                          value={a.id}
                                          disabled={isOccupiedByOther}
                                        >
                                          {a.code} ({a.name})
                                          {isOccupiedByOther ? " — Occupied" : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="xs"
                                      variant="default"
                                      disabled={
                                        actionLoading ||
                                        !selectedAnchorId ||
                                        selectedAnchorId === child.anchor?.id
                                      }
                                      onClick={() => handleMapChildAnchor(child.location.id)}
                                    >
                                      Assign
                                    </Button>
                                    {child.node && (
                                      <Button
                                        size="xs"
                                        variant="ghost"
                                        title="Unmap child"
                                        disabled={actionLoading}
                                        onClick={() => handleUnmapChild(child.node!.id)}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: 2D Layout Preview */}
            {activeTab === "preview" && (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>
                    Visual representation of anchors on{" "}
                    <strong className="text-foreground">
                      {context.model ? context.model.code : context.location.code}
                    </strong>
                  </span>
                  <span>
                    {context.modelAnchors.length} configured anchors
                  </span>
                </div>

                {context.modelAnchors.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No model anchors configured to render a 2D compartment layout.
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-border bg-muted/20">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                      {context.modelAnchors.map((anchor) => {
                        const assignedChild = context.children.find(
                          (c) => c.anchor?.id === anchor.id,
                        );
                        return (
                          <div
                            key={anchor.id}
                            className={`p-3 rounded border text-left transition-all ${
                              assignedChild
                                ? "bg-background border-primary/40 shadow-xs ring-1 ring-primary/20"
                                : "bg-muted/40 border-dashed border-border text-muted-foreground"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-xs font-bold text-foreground">
                                {anchor.code}
                              </span>
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                {anchor.anchorType || "SLOT"}
                              </span>
                            </div>

                            {assignedChild ? (
                              <div className="space-y-0.5">
                                <div className="font-mono text-[11px] font-semibold text-primary truncate">
                                  {assignedChild.location.code}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {assignedChild.location.name}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground/60 italic pt-1">
                                Unassigned
                              </div>
                            )}

                            <div className="mt-2 pt-1 border-t border-border/40 font-mono text-[9px] text-muted-foreground/80">
                              ({anchor.localPositionX ?? 0}, {anchor.localPositionY ?? 0})
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
