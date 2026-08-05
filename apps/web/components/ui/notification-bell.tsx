'use client'

import * as React from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { notificationsApi, NotificationDto } from '@/lib/api/notifications-api'
import { NotificationCard } from '@/components/ui/notification-card'

import { HeaderAction } from '@/components/ui/header-action'

export function NotificationBell() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<NotificationDto[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [loading, setLoading] = React.useState(false)

  const loadNotifications = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await notificationsApi.getUserNotifications()
      setNotifications(data)
      const countRes = await notificationsApi.getUnreadCount()
      setUnreadCount(countRes.unread)
    } catch {
      setNotifications([])
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000) // Poll every 30s
    return () => clearInterval(interval)
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

  return (
    <div className="relative">
      <HeaderAction
        variant="outline"
        size="icon"
        active={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        title="Notifications"
        className="relative"
      >
        <Bell className="size-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </HeaderAction>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border shadow-2xl rounded-xl z-50 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150">
          <div className="p-3 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No notifications right now.
              </div>
            ) : (
              notifications.slice(0, 5).map((notif) => (
                <NotificationCard key={notif.id} notification={notif} onMarkRead={handleMarkRead} />
              ))
            )}
          </div>

          <div className="p-2 border-t border-border bg-muted/10 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-primary hover:underline block py-1"
            >
              View All Notifications & Preferences →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
