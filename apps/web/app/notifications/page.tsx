"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { NotificationCard } from "@/components/ui/notification-card";
import { notificationsApi, NotificationDto } from "@/lib/api/notifications-api";
import { Bell, CheckCheck, Filter, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = React.useState<NotificationDto[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = React.useState<string>("");
  const [unreadOnly, setUnreadOnly] = React.useState<boolean>(false);

  const loadNotifications = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationsApi.getUserNotifications();
      setNotifications(data);
    } catch {
      setError("Failed to load notifications feed.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (unreadOnly && n.isRead) return false;
    if (moduleFilter && n.module !== moduleFilter) return false;
    return true;
  });

  const totalCount = notifications.length;
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const urgentCount = notifications.filter(
    (n) => n.priority === "URGENT" || n.priority === "HIGH",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        description="Centralized event-driven communication feed and user notification preferences across all ERP modules."
        actions={
          <Button
            size="sm"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Mark All Read
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Notifications"
          value={totalCount.toString()}
          subtitle="All received events"
          icon={Bell}
        />
        <StatCard
          title="Unread Messages"
          value={unreadCount.toString()}
          subtitle="Requires user attention"
          icon={Zap}
        />
        <StatCard
          title="High Priority Alerts"
          value={urgentCount.toString()}
          subtitle="Urgent & High severity"
          icon={ShieldAlert}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-card border border-border rounded-xl shadow-2xs">
        <Field orientation="horizontal" className="w-auto items-center">
          <Checkbox
            id="unread-only"
            checked={unreadOnly}
            onCheckedChange={(checked) => setUnreadOnly(Boolean(checked))}
          />
          <FieldLabel
            htmlFor="unread-only"
            className="cursor-pointer text-xs font-medium text-foreground"
          >
            Unread Only ({unreadCount})
          </FieldLabel>
        </Field>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <Select
            value={moduleFilter || "ALL"}
            onValueChange={(val) =>
              setModuleFilter(!val || val === "ALL" ? "" : val)
            }
          >
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Modules</SelectItem>
              <SelectItem value="Inventory">Inventory</SelectItem>
              <SelectItem value="Procurement">Procurement</SelectItem>
              <SelectItem value="Manufacturing">Manufacturing</SelectItem>
              <SelectItem value="Projects">Projects</SelectItem>
              <SelectItem value="Security">Security</SelectItem>
              <SelectItem value="Documents">Documents</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notifications Feed */}
      {loading ? (
        <LoadingState message="Loading Notifications Feed..." />
      ) : error ? (
        <ErrorState
          title="Error Loading Feed"
          message={error}
          onRetry={loadNotifications}
        />
      ) : filteredNotifications.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
          No notifications found for selected filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              onMarkRead={handleMarkRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}
