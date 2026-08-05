"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function CustomerReturnDetailPage() {
  const params = useParams();
  const retId = params?.id as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/customer-returns">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Customer Returns
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Customer Return #${retId || "CR-2026-011"}`}
        description="Return inspection notes, disposition details, and credit note issuance."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="text-sm font-semibold text-foreground">
            AeroTech Systems
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Return Status</p>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            INSPECTED
          </span>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Disposition</p>
          <p className="text-sm font-semibold text-foreground">
            Restock to Inventory
          </p>
        </div>
      </div>
    </div>
  );
}
