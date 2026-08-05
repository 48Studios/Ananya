'use client'

import * as React from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { NotificationCard } from '@/components/ui/notification-card'
import { notificationsApi, NotificationDto } from '@/lib/api/notifications-api'
import { Bell, CheckCheck, Filter, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = React.useState<NotificationDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [moduleFilter, setModuleFilter] = React.useState<string>('')
  const [unreadOnly, setUnreadOnly] = React.useState<boolean>(false)

  const loadNotifications = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await notificationsApi.getUserNotifications()
      setNotifications(data)
    } catch {
      setError('Failed to load notifications feed.')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id)
      await loadNotifications()
    } catch {
      // ignore
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead()
      await loadNotifications()
    } catch {
      // ignore
    }
  }

  const filteredNotifications = notifications.filter((n) => {
    if (unreadOnly && n.isRead) return false
    if (moduleFilter && n.module !== moduleFilter) return false
    return true
  })

  const totalCount = notifications.length
  const unreadCount = notifications.filter((n) => !n.isRead).length
  const urgentCount = notifications.filter((n) => n.priority === 'URGENT' || n.priority === 'HIGH').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        description="Centralized event-driven communication feed and user notification preferences across all ERP modules."
        actions={
          <Button size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
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
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded text-primary focus:ring-primary"
            />
            <span>Unread Only ({unreadCount})</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-input/50 border border-border rounded-lg text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Modules</option>
            <option value="Inventory">Inventory</option>
            <option value="Procurement">Procurement</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Projects">Projects</option>
            <option value="Security">Security</option>
            <option value="Documents">Documents</option>
          </select>
        </div>
      </div>

      {/* Notifications Feed */}
      {loading ? (
        <LoadingState message="Loading Notifications Feed..." />
      ) : error ? (
        <ErrorState title="Error Loading Feed" message={error} onRetry={loadNotifications} />
      ) : filteredNotifications.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
          No notifications found for selected filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => (
            <NotificationCard key={notif.id} notification={notif} onMarkRead={handleMarkRead} />
          ))}
        </div>
      )}
    </div>
  )
}
