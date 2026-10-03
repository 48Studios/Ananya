"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Building, Mail, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export default function CustomerDetailPage() {
  const params = useParams();
  const custId = params?.id as string;

  return (
    <div className="space-y-6">

      <PageHeader
        backHref="/sales/customers"
        backLabel="Back to Customers"
        title={`Customer Account #${custId || "CUST-001"}`}
        description="Enterprise client profile, credit terms, billing address, and sales history."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Building className="w-3.5 h-3.5" /> Company Account
          </p>
          <p className="text-sm font-semibold text-foreground">
            ACME Components Inc.
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> Primary Contact
          </p>
          <p className="text-sm font-mono text-foreground">
            procurement@example.com
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> Billing Address
          </p>
          <p className="text-sm font-semibold text-foreground">
            Seattle, WA (USA)
          </p>
        </div>
      </div>
    </div>
  );
}
