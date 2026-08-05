"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";

interface StorageBin {
  id: string;
  binCode: string;
  warehouseName: string;
  zone: string;
  capacityVolume: string;
  currentOccupancy: string;
  status: "ACTIVE" | "FULL" | "MAINTENANCE";
}

const mockBins: StorageBin[] = [
  {
    id: "bin-1",
    binCode: "BIN-A1-01",
    warehouseName: "Main Assembly WH",
    zone: "Zone A - Microcontrollers",
    capacityVolume: "100 cu ft",
    currentOccupancy: "45% Used",
    status: "ACTIVE",
  },
  {
    id: "bin-2",
    binCode: "BIN-A1-02",
    warehouseName: "Main Assembly WH",
    zone: "Zone A - Microcontrollers",
    capacityVolume: "100 cu ft",
    currentOccupancy: "80% Used",
    status: "ACTIVE",
  },
  {
    id: "bin-3",
    binCode: "BIN-B2-05",
    warehouseName: "Raw Materials WH",
    zone: "Zone B - Metals & Extrusions",
    capacityVolume: "250 cu ft",
    currentOccupancy: "100% Full",
    status: "FULL",
  },
];

export default function WarehouseBinsPage() {
  const [bins] = React.useState<StorageBin[]>(mockBins);

  const columns: ColumnDef<StorageBin>[] = [
    {
      accessorKey: "binCode",
      header: "Storage Bin Path",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.binCode}
        </span>
      ),
    },
    {
      accessorKey: "warehouseName",
      header: "Facility",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.warehouseName}
        </span>
      ),
    },
    {
      accessorKey: "zone",
      header: "Zone / Aisle",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.zone}
        </span>
      ),
    },
    {
      accessorKey: "capacityVolume",
      header: "Max Capacity",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.capacityVolume}
        </span>
      ),
    },
    {
      accessorKey: "currentOccupancy",
      header: "Occupancy",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.currentOccupancy}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "ACTIVE") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Active Available
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {s}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Bins & Storage Locations"
        description="Configure aisle, rack, and shelf bin paths for high-density inventory putaway."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Bin Location
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Bins"
          value={bins.length}
          icon={<Boxes className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Available Bins"
          value={bins.filter((b) => b.status === "ACTIVE").length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Fully Utilized Bins"
          value={bins.filter((b) => b.status === "FULL").length}
          icon={<Boxes className="w-4 h-4 text-amber-500" />}
        />
      </div>

      <EntityDataTable
        data={bins}
        columns={columns}
        searchPlaceholder="Search bin locations by code, zone, or facility..."
      />
    </div>
  );
}
