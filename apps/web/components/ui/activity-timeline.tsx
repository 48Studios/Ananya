"use client";

import * as React from "react";
import Link from "next/link";
import {
  Boxes,
  Truck,
  Factory,
  FolderKanban,
  UserCheck,
  Shield,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Clock,
  User as UserIcon,
  Search,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityEventDto, SecurityAuditLogDto } from "@/lib/api/activity-api";

export function ActivityIcon({
  module,
  severity,
  className,
}: {
  module: string;
  severity?: string;
  className?: string;
}) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Inventory: Boxes,
    Procurement: Truck,
    Manufacturing: Factory,
    Projects: FolderKanban,
    Administration: UserCheck,
    Security: Shield,
    Reports: FileText,
  };

  const IconComponent = iconMap[module] || Info;

  const colorMap: Record<string, string> = {
    INFO: "text-primary bg-primary/10 border-primary/20",
    LOW: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    MEDIUM: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    HIGH: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    CRITICAL: "text-destructive bg-destructive/10 border-destructive/20",
  };

  const colorClass = colorMap[severity || "INFO"] || colorMap.INFO;

  return (
    <div
      className={cn(
        "p-2 rounded-lg border flex items-center justify-center shrink-0",
        colorClass,
        className,
      )}
    >
      <IconComponent className="w-4 h-4" />
    </div>
  );
}

export function ActivityBadge({
  status,
  severity,
}: {
  status?: string;
  severity?: string;
}) {
  if (severity === "CRITICAL" || status === "FAILED" || status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
        <XCircle className="w-3 h-3" />
        {status || severity}
      </span>
    );
  }

  if (severity === "HIGH" || severity === "MEDIUM" || status === "WARNING") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <AlertTriangle className="w-3 h-3" />
        {status || severity}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" />
      {status || severity || "SUCCESS"}
    </span>
  );
}

export function ActivityCard({ event }: { event: ActivityEventDto }) {
  const formattedDate = new Date(event.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex gap-3.5 p-4 rounded-xl bg-card border border-border/70 hover:border-primary/30 transition-all shadow-2xs group">
      <ActivityIcon module={event.module} severity={event.severity} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-xs text-foreground tracking-tight">
              {event.entityTitle || event.entityId}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground uppercase">
              {event.entityType}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
              {event.eventType}
            </span>
            <ActivityBadge status={event.status} severity={event.severity} />
          </div>

          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono shrink-0">
            <Clock className="w-3 h-3" />
            <span>{formattedDate}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          {event.description}
        </p>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground flex-wrap pt-2 border-t border-border/40">
          <div className="flex items-center gap-1.5">
            <UserIcon className="w-3 h-3" />
            <span>
              {event.userName || event.userEmail || "System Operations"}
            </span>
            {event.ipAddress && (
              <span className="text-[10px] font-mono text-muted-foreground/70">
                ({event.ipAddress})
              </span>
            )}
          </div>

          {event.href && (
            <Link
              href={event.href}
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs group-hover:translate-x-0.5 transition-transform"
            >
              <span>View Entity</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityTimeline({ events }: { events: ActivityEventDto[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="py-12 text-center border border-dashed border-border rounded-xl bg-card/50 p-6">
        <Clock className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-xs font-semibold text-foreground mb-1">
          No Activity Logged
        </p>
        <p className="text-xs text-muted-foreground">
          Operational activity and events will appear here in chronological
          order.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
      {events.map((event) => (
        <div key={event.id} className="relative">
          <div className="absolute -left-6 top-4 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
          <ActivityCard event={event} />
        </div>
      ))}
    </div>
  );
}

export function ActivityFilters({
  module,
  setModule,
  severity,
  setSeverity,
  search,
  setSearch,
}: {
  module: string;
  setModule: (m: string) => void;
  severity: string;
  setSeverity: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const modules = [
    "All",
    "Inventory",
    "Procurement",
    "Manufacturing",
    "Projects",
    "Administration",
    "Security",
  ];
  const severities = ["All", "INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-card border border-border rounded-xl shadow-2xs mb-6">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter activity feed (entity, description, user)..."
          className="pl-9 text-xs"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Filter className="w-3.5 h-3.5" />
          <span>Module:</span>
        </div>
        <Select
          value={module || "ALL"}
          onValueChange={(val) => setModule(!val || val === "ALL" ? "" : val)}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            {modules.map((m) => (
              <SelectItem key={m} value={m === "All" ? "ALL" : m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-2">
          <span>Severity:</span>
        </div>
        <Select
          value={severity || "ALL"}
          onValueChange={(val) => setSeverity(!val || val === "ALL" ? "" : val)}
        >
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            {severities.map((s) => (
              <SelectItem key={s} value={s === "All" ? "ALL" : s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function AuditTable({ logs }: { logs: SecurityAuditLogDto[] }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="py-12 text-center border border-dashed border-border rounded-xl bg-card/50 p-6">
        <Shield className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-xs font-semibold text-foreground mb-1">
          No Audit Entries Found
        </p>
        <p className="text-xs text-muted-foreground">
          Security audit logs and admin actions will be recorded here.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Module Category</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-foreground">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-medium">
                  {log.userEmail || log.userId || "System"}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                    {log.category}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-foreground">
                  {log.action}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {log.ipAddress || "127.0.0.1"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
