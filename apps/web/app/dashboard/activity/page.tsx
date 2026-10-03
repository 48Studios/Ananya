"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  ActivityTimeline,
  ActivityFilters,
} from "@/components/ui/activity-timeline";
import { activityApi, ActivityEventDto } from "@/lib/api/activity-api";
import { Activity, ShieldCheck, Zap, AlertTriangle } from "lucide-react";

export default function ActivityCenterPage() {
  const [events, setEvents] = React.useState<ActivityEventDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [module, setModule] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [search, setSearch] = React.useState("");

  const loadFeed = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await activityApi.getFeed({
        module: module || undefined,
        severity: severity || undefined,
        search: search.trim() || undefined,
        limit: 50,
      });
      setEvents(data);
    } catch {
      setError("Failed to fetch global activity feed. Using offline state.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [module, severity, search]);

  React.useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const totalEvents = events.length;
  const criticalCount = events.filter(
    (e) => e.severity === "CRITICAL" || e.severity === "HIGH",
  ).length;
  const inventoryCount = events.filter((e) => e.module === "Inventory").length;
  const procurementCount = events.filter(
    (e) => e.module === "Procurement",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Center"
        description="Centralized timeline of operational activities, inventory transactions, and system updates."
      />

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Operations Logged"
          value={totalEvents.toString()}
          subtitle="System activity feed"
          icon={Activity}
        />
        <StatCard
          title="High Severity Events"
          value={criticalCount.toString()}
          subtitle="Alerts & critical warnings"
          icon={AlertTriangle}
        />
        <StatCard
          title="Inventory Operations"
          value={inventoryCount.toString()}
          subtitle="Receipts, adjustments & transfers"
          icon={Zap}
        />
        <StatCard
          title="Procurement Activity"
          value={procurementCount.toString()}
          subtitle="Orders & supplier interactions"
          icon={ShieldCheck}
        />
      </div>

      {/* Filters */}
      <ActivityFilters
        module={module}
        setModule={setModule}
        severity={severity}
        setSeverity={setSeverity}
        search={search}
        setSearch={setSearch}
      />

      {/* Main Feed Content */}
      {loading ? (
        <LoadingState message="Loading Activity Stream... Aggregating operational logs across all bounded contexts." />
      ) : error ? (
        <ErrorState
          title="Error Loading Feed"
          message={error}
          onRetry={loadFeed}
        />
      ) : (
        <ActivityTimeline events={events} />
      )}
    </div>
  );
}
