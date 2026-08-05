"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldAlert, ShieldCheck, KeyRound, Filter } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auditApi, SecurityAuditLogDto } from "@/lib/api/audit-api";

export default function SecurityAuditPage() {
  const [logs, setLogs] = React.useState<SecurityAuditLogDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = React.useState("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.getLogs(categoryFilter || undefined);
      setLogs(data);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to fetch security audit log.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const columns = React.useMemo<ColumnDef<SecurityAuditLogDto>[]>(
    () => [
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground">
            {row.original.action}
          </span>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
            {row.original.category}
          </span>
        ),
      },
      {
        accessorKey: "userEmail",
        header: "User Account",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.userEmail || "System"}
          </span>
        ),
      },
      {
        accessorKey: "ipAddress",
        header: "IP Address",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.ipAddress || "127.0.0.1"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Timestamp",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return <LoadingState message="Fetching security audit trail..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Security Audit Error"
        message={error}
        onRetry={loadData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Security Audit Log"
        description="Immutable audit log of authentication attempts, privilege modifications, and security events."
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Recorded Audit Events"
          value={logs.length}
          subtitle="System security log entries"
          icon={ShieldCheck}
        />
        <StatCard
          title="Login Attempts"
          value={logs.filter((l) => l.action.startsWith("LOGIN")).length}
          subtitle="Successful & failed logins"
          icon={KeyRound}
        />
        <StatCard
          title="Password Events"
          value={logs.filter((l) => l.action.includes("PASSWORD")).length}
          subtitle="Resets & modifications"
          icon={KeyRound}
        />
        <StatCard
          title="Role Modifying Events"
          value={logs.filter((l) => l.action.includes("ROLE")).length}
          subtitle="Policy assignments"
          icon={ShieldAlert}
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Category Filter</span>
        </div>
        <Select
          value={categoryFilter || "ALL"}
          onValueChange={(val) =>
            setCategoryFilter(!val || val === "ALL" ? "" : val)
          }
        >
          <SelectTrigger className="h-8 text-xs w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            <SelectItem value="SECURITY">SECURITY</SelectItem>
            <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Audit Log DataTable */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Audit Trail History ({logs.length} entries)
        </h3>
        <EntityDataTable
          columns={columns}
          data={logs}
          searchKey="action"
          searchPlaceholder="Search action or user email..."
          loading={loading}
          emptyTitle="No audit records found"
          emptyMessage="No security events match the current filter."
        />
      </div>
    </div>
  );
}
