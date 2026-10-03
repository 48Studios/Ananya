"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";
import { InventoryBuilderWorkspace } from "@/components/spatial/builder";

function InventoryBuilderContent() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const initialMode = modeParam === "map" ? "map" : "build";
  const initialLocation = searchParams.get("location");

  return (
    <InventoryBuilderWorkspace
      initialMode={initialMode}
      initialParentLocationId={initialLocation}
    />
  );
}

export default function InventoryBuilderPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingState message="Loading Inventory Builder workspace..." />
        </div>
      }
    >
      <InventoryBuilderContent />
    </React.Suspense>
  );
}
