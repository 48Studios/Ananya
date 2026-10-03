"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Activity,
  User as UserIcon,
  Globe,
  Clock,
  Eye,
  RefreshCw,
  Download,
  Copy,
  Check,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { DialogShell, DialogShellBody } from "@/components/ui/dialog-shell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PermissionGuard } from "@/lib/auth/auth-context";
import { activityApi, type SecurityAuditLogDto } from "@/lib/api/activity-api";

function getCategoryBadge(category: string) {
  const norm = (category || "").toUpperCase();
  let color = "bg-muted text-muted-foreground border-border";

  if (norm.includes("AUTH") || norm.includes("LOGIN")) {
    color = "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
  } else if (norm.includes("SEC") || norm.includes("ROLE") || norm.includes("PERMISSION")) {
    color = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  } else if (norm.includes("ADMIN")) {
    color = "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
  } else if (norm.includes("INVENTORY") || norm.includes("STOCK")) {
    color = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  } else if (norm.includes("PROCUREMENT") || norm.includes("MANUFACTURING")) {
    color = "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20";
  } else if (norm.includes("DOCUMENT") || norm.includes("PACK")) {
    color = "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${color}`}
    >
      {category || "General"}
    </span>
  );
}

export default function AuditExplorerPage() {
  const [logs, setLogs] = React.useState<SecurityAuditLogDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedLog, setSelectedLog] = React.useState<SecurityAuditLogDto | null>(null);
  const [copiedPayload, setCopiedPayload] = React.useState(false);

  const loadAuditTrail = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await activityApi.getAuditTrail({ limit: 500 });
      setLogs(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load audit trail logs. Please check connectivity.",
      );
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAuditTrail();
  }, [loadAuditTrail]);

  // Derived metrics
  const totalLogs = logs.length;
  const authLogs = React.useMemo(
    () =>
      logs.filter(
        (l) =>
          l.category?.toUpperCase().includes("AUTH") ||
          l.action.toUpperCase().includes("LOGIN") ||
          l.action.toUpperCase().includes("PASSWORD"),
      ).length,
    [logs],
  );
  const secLogs = React.useMemo(
    () =>
      logs.filter(
        (l) =>
          l.category?.toUpperCase().includes("SEC") ||
          l.action.toUpperCase().includes("ROLE") ||
          l.action.toUpperCase().includes("PERMISSION") ||
          l.action.toUpperCase().includes("POLICY"),
      ).length,
    [logs],
  );
  const opLogs = React.useMemo(
    () => totalLogs - authLogs - secLogs,
    [totalLogs, authLogs, secLogs],
  );

  // Dynamic filter configuration
  const filterConfigs: FilterConfig[] = React.useMemo(() => {
    const rawCategories = Array.from(new Set(logs.map((l) => l.category).filter(Boolean)));
    const categories = rawCategories.length > 0
      ? rawCategories
      : ["Authentication", "Security", "Administration", "Inventory", "Procurement", "Manufacturing"];

    return [
      {
        columnId: "category",
        title: "Category",
        options: categories.map((cat) => ({
          label: cat,
          value: cat,
        })),
      },
    ];
  }, [logs]);

  // Columns definition
  const columns = React.useMemo<ColumnDef<SecurityAuditLogDto>[]>(
    () => [
      {
        accessorKey: "action",
        header: "Action",
        meta: { width: "22%" },
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[200px]">
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => setSelectedLog(row.original)}
                      className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase font-bold inline-block truncate max-w-full align-middle hover:bg-muted transition-colors cursor-pointer text-left"
                    />
                  }
                >
                  {row.original.action}
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-xs">
                  {row.original.action} (Click to inspect)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        meta: { width: "16%" },
        cell: ({ row }) => getCategoryBadge(row.original.category),
      },
      {
        accessorKey: "userEmail",
        header: "Actor / Account",
        meta: { width: "22%" },
        cell: ({ row }) => {
          const email = row.original.userEmail;
          const userId = row.original.userId;
          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <UserIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span
                className="text-xs font-medium text-foreground truncate"
                title={email ? `${email} (${userId || "No ID"})` : "System Operations"}
              >
                {email || "System Operations"}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "ipAddress",
        header: "IP Address",
        meta: { width: "16%" },
        cell: ({ row }) => {
          const ip = row.original.ipAddress;
          const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
          const isMissing = !ip;

          return (
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="flex items-center gap-1.5 font-mono text-xs cursor-default">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span
                        className={
                          isMissing
                            ? "text-muted-foreground/60 italic"
                            : isLoopback
                              ? "text-muted-foreground"
                              : "text-foreground font-medium"
                        }
                      >
                        {isMissing ? "Internal" : ip}
                      </span>
                    </div>
                  }
                />
                <TooltipContent side="top" className="text-xs">
                  {isMissing
                    ? "Internal system or background process execution"
                    : isLoopback
                      ? "Direct loopback / local connection"
                      : `Origin client IP: ${ip}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Timestamp",
        meta: { width: "16%" },
        cell: ({ row }) => {
          const d = new Date(row.original.createdAt);
          return (
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 cursor-default" />
                  }
                >
                  <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span>{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-xs">
                  {d.toISOString()}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="text-right block w-full">Actions</span>,
        meta: {
          width: "8%",
          headerClassName: "text-right",
          cellClassName: "text-right",
        },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Inspect audit event"
              aria-label="Inspect audit event"
              onClick={() => setSelectedLog(row.original)}
            >
              <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  // Export handlers
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const headers = ["Timestamp", "Action", "Category", "User Email", "User ID", "IP Address", "Details"];
    const rows = logs.map((l) => [
      l.createdAt,
      l.action,
      l.category,
      l.userEmail || "",
      l.userId || "",
      l.ipAddress || "",
      l.details ? JSON.stringify(l.details).replace(/"/g, '""') : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyDetailsJson = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(
      JSON.stringify(selectedLog.details || {}, null, 2),
    );
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <PermissionGuard permission="Administration.Security">
      <div className="space-y-6">
        <PageHeader
          title="Audit Explorer"
          description="Enterprise compliance audit log tracking system access, permission modifications, security events, and data changes."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="gap-1.5 text-xs"
                title="Export audit log to CSV format"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                className="gap-1.5 text-xs"
                title="Export raw audit log as JSON"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAuditTrail}
                disabled={loading}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Audit Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Audit Events"
            value={totalLogs.toString()}
            subtitle="Recorded security & system logs"
            icon={ShieldCheck}
          />
          <StatCard
            title="Auth Operations"
            value={authLogs.toString()}
            subtitle="Logins, password events & sessions"
            icon={Lock}
          />
          <StatCard
            title="Security & Access"
            value={secLogs.toString()}
            subtitle="Roles, permissions & policies"
            icon={ShieldAlert}
          />
          <StatCard
            title="Operational Actions"
            value={opLogs.toString()}
            subtitle="Data mutations & system operations"
            icon={Activity}
          />
        </div>

        {/* Entity Data Table */}
        <EntityDataTable
          notice={
            error ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <Button variant="ghost" size="xs" onClick={loadAuditTrail}>
                  Retry
                </Button>
              </div>
            ) : null
          }
          columns={columns}
          data={logs}
          searchKey="action"
          searchPlaceholder="Search audit events by action, user account, IP address..."
          filterConfigs={filterConfigs}
          loading={loading}
          emptyTitle="No audit log entries recorded"
          emptyMessage="Security events, authentication attempts, and privilege modifications will appear here."
        />

        {/* Audit Detail Inspector Dialog */}
        <DialogShell
          open={Boolean(selectedLog)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedLog(null);
              setCopiedPayload(false);
            }
          }}
          title="Audit Event Inspection"
          description={
            selectedLog
              ? `Event record ID: ${selectedLog.id}`
              : "Detailed telemetry and payload metadata."
          }
          icon={<Shield className="w-5 h-5 text-primary" />}
          size="md"
        >
          <DialogShellBody>
            {selectedLog && (
              <div className="space-y-4 text-xs">
                {/* Event Attributes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                      Action / Event
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {selectedLog.action}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                      Category
                    </span>
                    <div>{getCategoryBadge(selectedLog.category)}</div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                      Actor User Account
                    </span>
                    <span className="font-medium text-foreground">
                      {selectedLog.userEmail || "System Operations"}
                    </span>
                    {selectedLog.userId && (
                      <span className="font-mono text-[10px] text-muted-foreground block truncate">
                        ID: {selectedLog.userId}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                      Network Source (Client IP)
                    </span>
                    <span className="font-mono text-foreground font-semibold">
                      {selectedLog.ipAddress || "Internal System Execution"}
                    </span>
                    {selectedLog.ipAddress &&
                      (selectedLog.ipAddress === "127.0.0.1" || selectedLog.ipAddress === "::1") && (
                        <span className="text-[10px] text-muted-foreground block">
                          (Loopback / Local host connection)
                        </span>
                      )}
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                      Event Timestamp
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {new Date(selectedLog.createdAt).toLocaleString()} (UTC: {new Date(selectedLog.createdAt).toISOString()})
                    </span>
                  </div>
                </div>

                {/* Event Payload */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      Event Details & Payload Metadata
                    </span>
                    {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={copyDetailsJson}
                        className="h-6 px-2 text-[10px] gap-1"
                      >
                        {copiedPayload ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy JSON
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {selectedLog.details && Object.keys(selectedLog.details).length > 0 ? (
                    <pre className="p-3 rounded-lg border border-border bg-muted/60 font-mono text-[11px] text-foreground overflow-x-auto max-h-64 leading-relaxed">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  ) : (
                    <div className="p-4 rounded-lg border border-dashed border-border text-center text-muted-foreground text-xs bg-muted/20">
                      No additional metadata payload was recorded for this event.
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogShellBody>
        </DialogShell>
      </div>
    </PermissionGuard>
  );
}
