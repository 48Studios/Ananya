"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/lib/utils";

export default function OpportunityDetailPage() {
  const params = useParams();
  const oppId = params?.id as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/opportunities">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Opportunities
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Opportunity Deal #${oppId || "opp-1"}`}
        description="Deal stage progress, expected revenue value, and client negotiation milestones."
        actions={
          <Button size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Mark Deal Closed-Won
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Account Customer</p>
          <p className="text-sm font-semibold text-foreground">
            AeroTech Systems
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Stage</p>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            NEGOTIATION (85%)
          </span>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Target Deal Amount</p>
          <p className="text-sm font-bold font-mono text-foreground">
            {formatCurrency(145000)}
          </p>
        </div>
      </div>
    </div>
  );
}
