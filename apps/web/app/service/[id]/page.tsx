"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  serviceRequestsApi,
  type ServiceRequestDto,
} from "@/lib/api/service-requests-api";

export default function ServiceTicketDetailPage() {
  const params = useParams();
  const ticketId = params?.id as string;

  const [ticket, setTicket] = React.useState<ServiceRequestDto | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!ticketId) return;
    serviceRequestsApi
      .getById(ticketId)
      .then((data) => setTicket(data))
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
      <div className="flex items-center gap-2">
        <Link href="/service">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Service Tickets
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Field Service Ticket #${ticket?.ticketNumber || ticketId || "SRV-1"}`}
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
            {ticket?.customerName || "Customer Account"}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Asset Equipment</p>
          <p className="text-sm font-mono text-foreground">
            {ticket?.assetName || "-"}
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
