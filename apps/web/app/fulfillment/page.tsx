"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Truck, Plus, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { formatDate } from "@/lib/utils";

interface FulfillmentShipment {
  id: string;
  dispatchNumber: string;
  soNumber: string;
  customerName: string;
  carrier: string;
  trackingNumber: string;
  status: "PENDING_PICK" | "PICKED" | "DISPATCHED" | "DELIVERED";
  dispatchDate: string;
}

const mockShipments: FulfillmentShipment[] = [
  {
    id: "f-1",
    dispatchNumber: "DSP-2026-041",
    soNumber: "SO-2026-0881",
    customerName: "AeroTech Systems",
    carrier: "DHL Express Industrial",
    trackingNumber: "DHL-98120491",
    status: "DISPATCHED",
    dispatchDate: "2026-02-04",
  },
  {
    id: "f-2",
    dispatchNumber: "DSP-2026-042",
    soNumber: "SO-2026-0882",
    customerName: "Starlight Robotics",
    carrier: "FedEx Freight",
    trackingNumber: "FXF-48190248",
    status: "DELIVERED",
    dispatchDate: "2026-02-02",
  },
];

export default function FulfillmentPage() {
  const [shipments] = React.useState<FulfillmentShipment[]>(mockShipments);

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Fulfillment Phase",
      options: [
        { label: "Pending Pick", value: "PENDING_PICK" },
        { label: "Picked", value: "PICKED" },
        { label: "Dispatched", value: "DISPATCHED" },
        { label: "Delivered", value: "DELIVERED" },
      ],
    },
  ];

  const columns: ColumnDef<FulfillmentShipment>[] = [
    {
      accessorKey: "dispatchNumber",
      header: "Dispatch Slip No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.dispatchNumber}
        </span>
      ),
    },
    {
      accessorKey: "soNumber",
      header: "Ref Sales Order",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-medium">
          {row.original.soNumber}
        </span>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer Destination",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.customerName}
        </span>
      ),
    },
    {
      accessorKey: "carrier",
      header: "Logistics Carrier",
      cell: ({ row }) => (
        <div>
          <p className="text-xs font-semibold text-foreground">
            {row.original.carrier}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {row.original.trackingNumber}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "DELIVERED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Delivered
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> Dispatched
          </span>
        );
      },
    },
    {
      accessorKey: "dispatchDate",
      header: "Dispatch Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.dispatchDate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order Fulfillment & Shipments"
        description="Pick, pack, ship customer orders, generate bill of lading documents, and track carrier logistics."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Outbound Shipment
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Shipments Logged"
          value={shipments.length}
          icon={<Truck className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="In Transit"
          value={shipments.filter((s) => s.status === "DISPATCHED").length}
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Delivered Orders"
          value={shipments.filter((s) => s.status === "DELIVERED").length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={shipments}
        columns={columns}
        searchPlaceholder="Search shipments by dispatch #, SO #, or carrier..."
        filterConfigs={filterConfigs}
      />
    </div>
  );
}
