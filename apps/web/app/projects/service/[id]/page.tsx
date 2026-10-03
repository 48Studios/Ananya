"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { serviceRequestsApi } from "@/lib/api/service-requests-api";
import { customersApi } from "@/lib/api/customers-api";
import {
  toServiceRequestRow,
  toCustomerNameMap,
  type ServiceRequestRow,
} from "@/lib/service-requests";

export default function ServiceTicketDetailPage() {
  const params = useParams();
  const ticketId = params?.id as string;

  const [ticket, setTicket] = React.useState<ServiceRequestRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!ticketId) return;
    Promise.all([
      serviceRequestsApi.getById(ticketId),
      customersApi.getAll().catch(() => []),
    ])
      .then(([request, customers]) =>
        setTicket(toServiceRequestRow(request, toCustomerNameMap(customers))),
      )
      .catch(() => setTicket(null))
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading service ticket details...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <PageHeader
        backHref="/projects/service"
        backLabel="Back to Service Tickets"
        title={`Field Service Ticket ${ticket?.serviceNumber ?? ticketId ?? ""}`.trim()}
        description="Field diagnostic details, technician assignment, and resolution log."
        actions={
          <Button size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Resolve & Close Ticket
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="text-sm font-semibold text-foreground">
            {ticket?.customerName || "Unassigned customer"}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Asset Equipment</p>
          <p className="text-sm font-mono text-foreground">
            {ticket?.assetLabel || "No asset recorded"}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Status / Priority</p>
          <p className="text-sm font-semibold text-primary">
            {ticket?.status || "OPEN"} ({ticket?.priority || "NORMAL"})
          </p>
        </div>
      </div>
    </div>
  );
}
