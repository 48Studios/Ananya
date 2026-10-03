"use client";

import * as React from "react";
import {
  type GeneratedCompartment,
  type ParametricStorageConfig,
} from "@ananya/inventory";
import type { SlotMappingRecord } from "@/lib/spatial/inventory-builder-state";
import { convertGeneratedToSceneLayout } from "@/lib/spatial/inventory-builder-state";
import { DynamicSpatial3DViewport } from "@/components/spatial/spatial-3d-view";
import { cn } from "@/lib/utils";

export interface ParametricPreview3DProps {
  config: ParametricStorageConfig;
  compartments: GeneratedCompartment[];
  mappings: Map<string, SlotMappingRecord>;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onSwitchTo2D: () => void;
  className?: string;
}

export function ParametricPreview3D({
  config,
  compartments,
  mappings,
  selectedSlotId,
  onSelectSlot,
  onSwitchTo2D,
  className,
}: ParametricPreview3DProps) {
  // Convert generated compartments to Three.js scene layout
  const childrenLayout = React.useMemo(() => {
    return convertGeneratedToSceneLayout(compartments, mappings, config.dimensions);
  }, [compartments, mappings, config.dimensions]);

  // Construct synthetic parent container data representing the parametric carcass
  const parentData = React.useMemo(() => {
    return {
      location: {
        id: "builder-carcass",
        code: "CONTAINER",
        name: config.templateType,
        kind: "cabinet",
        parentId: null,
        isActive: true,
      },
      node: null,
      model: {
        id: "parametric-carcass-model",
        code: config.templateType,
        name: config.templateType,
        format: "internal",
        widthMm: config.dimensions.widthMm,
        heightMm: config.dimensions.heightMm,
        depthMm: config.dimensions.depthMm,
        isActive: true,
        metadata: {},
      },
      anchors: [],
    };
  }, [config]);

  const emptyStockMap = React.useMemo(() => new Map(), []);

  return (
    <div className={cn("w-full h-full min-h-[460px] rounded-lg overflow-hidden border border-border bg-card", className)}>
      <DynamicSpatial3DViewport
        parentData={parentData}
        childrenLayout={childrenLayout}
        unmappedChildren={[]}
        stockMap={emptyStockMap}
        selectedLocationId={selectedSlotId}
        onSelectLocation={onSelectSlot}
        onSwitchTo2D={onSwitchTo2D}
        visualizationMode="standard"
        showBadges={true}
      />
    </div>
  );
}
