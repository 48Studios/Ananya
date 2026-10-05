"use client";

import * as React from "react";
import {
  type GeneratedCompartment,
  type ParametricStorageConfig,
} from "@ananya/inventory";
import { Box } from "lucide-react";
import type { SlotMappingRecord } from "@/lib/spatial/inventory-builder-state";
import {
  BUILDER_CARCASS_LOCATION_ID,
  convertGeneratedToSceneLayout,
} from "@/lib/spatial/inventory-builder-state";
import { DynamicSpatial3DViewport } from "@/components/spatial/spatial-3d-view";
import type { LocationOperationalViewDto } from "@/lib/api/spatial-api";
import { cn } from "@/lib/utils";
import type { ContainerIdentity } from "./parametric-preview-2d";
import { ParentFirstCallout } from "./parent-first-callout";

export interface ParametricPreview3DProps {
  config: ParametricStorageConfig;
  compartments: GeneratedCompartment[];
  mappings: Map<string, SlotMappingRecord>;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  isContainerSelected: boolean;
  onSelectContainer: () => void;
  /** Shared parent-first gate: child compartments are locked until a container is assigned. */
  childInteractionEnabled: boolean;
  containerIdentity?: ContainerIdentity | null;
  onSwitchTo2D: () => void;
  className?: string;
}

export function ParametricPreview3D({
  config,
  compartments,
  mappings,
  selectedSlotId,
  onSelectSlot,
  isContainerSelected,
  onSelectContainer,
  childInteractionEnabled,
  containerIdentity,
  onSwitchTo2D,
  className,
}: ParametricPreview3DProps) {
  // Convert generated compartments to Three.js scene layout
  const childrenLayout = React.useMemo(() => {
    return convertGeneratedToSceneLayout(
      compartments,
      mappings,
      config.dimensions,
    );
  }, [compartments, mappings, config.dimensions]);

  // Construct synthetic parent container data representing the parametric carcass.
  // The carcass carries the assigned Ananya location identity for display, while
  // its interaction key stays synthetic so it can never be mistaken for a slot.
  const parentData = React.useMemo<LocationOperationalViewDto["parent"]>(() => {
    return {
      location: {
        id: BUILDER_CARCASS_LOCATION_ID,
        code: containerIdentity?.code ?? "CONTAINER",
        name: containerIdentity?.name ?? config.templateType,
        kind: containerIdentity?.kind ?? "cabinet",
        parentId: null,
        isActive: containerIdentity?.isActive ?? true,
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
      // The preview carcass is the container being authored: it is placed by
      // construction, and its frame comes from the model dimensions above.
      mapping: {
        status: "MAPPED",
        isMappingEligible: false,
        hasSpatialNode: false,
        directChildCount: compartments.length,
        mappedDirectChildCount: mappings.size,
        unmappedDirectChildCount: Math.max(
          0,
          compartments.length - mappings.size,
        ),
        containerStatus: "NONE",
        publishedLayout: null,
        slotMapping: null,
      },
    };
  }, [config, containerIdentity, compartments.length, mappings.size]);

  const emptyStockMap = React.useMemo(() => new Map(), []);

  const handleSelectLocation = React.useCallback(
    (locationId: string) => {
      if (locationId === BUILDER_CARCASS_LOCATION_ID) {
        onSelectContainer();
        return;
      }
      onSelectSlot(locationId);
    },
    [onSelectContainer, onSelectSlot],
  );

  return (
    <div
      className={cn(
        "flex flex-col w-full h-full min-h-[460px] rounded-lg overflow-hidden border border-border bg-card",
        className,
      )}
    >
      {/* Parent-first instruction, shared verbatim with the 2D view */}
      <ParentFirstCallout
        isParentAssigned={childInteractionEnabled}
        containerIdentity={containerIdentity}
        onSelectContainer={onSelectContainer}
        testId="parent-first-callout-3d"
      />

      <div className="relative flex-1 min-h-[360px]">
        <DynamicSpatial3DViewport
          parentData={parentData}
          childrenLayout={childrenLayout}
          unmappedChildren={[]}
          stockMap={emptyStockMap}
          selectedLocationId={
            isContainerSelected ? BUILDER_CARCASS_LOCATION_ID : selectedSlotId
          }
          onSelectLocation={handleSelectLocation}
          isParentSelectable={true}
          isChildInteractionEnabled={childInteractionEnabled}
          enableDrawerOpening={true}
          onSwitchTo2D={onSwitchTo2D}
          visualizationMode="standard"
          showBadges={true}
        />

        {isContainerSelected && (
          <div
            data-testid="container-selection-badge"
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur-xs border border-sky-500/70 text-sky-200 text-xs font-medium"
          >
            <Box className="size-3.5" />
            <span>Top-Level Container</span>
            <span className="font-mono text-[11px] text-sky-100/90">
              {containerIdentity
                ? `${containerIdentity.name} (${containerIdentity.code})`
                : "Unassigned"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
