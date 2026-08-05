"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Users, CheckCircle2, Mail, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = params?.id as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/leads">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Sales Leads
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Sales Lead #${leadId || "LD-2026-01"}`}
        description="Prospect contact information, interaction log, and qualification status."
        actions={
          <Button size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Convert to Opportunity
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Building className="w-3.5 h-3.5" /> Company Name
          </p>
          <p className="text-sm font-semibold text-foreground">
            Nexus Defense Industries
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Primary Contact
          </p>
          <p className="text-sm font-semibold text-foreground">
            Sarah Jenkins (VP Engineering)
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> Email
          </p>
          <p className="text-sm font-mono text-foreground">
            s.jenkins@nexusdefense.com
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground">
          Lead Activity & Touchpoint Log
        </h3>
        <div className="space-y-3">
          <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs space-y-1">
            <div className="flex justify-between font-semibold text-foreground">
              <span>Discovery Call Completed</span>
              <span className="text-muted-foreground font-mono text-[11px]">
                Feb 3, 2026
              </span>
            </div>
            <p className="text-muted-foreground">
              Discussed custom motor assembly requirements for Q3 aerospace
              prototype run.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
