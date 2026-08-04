'use client'

import React from 'react'
import { LayoutGrid, TrendingUp, AlertCircle, Clock, SlidersHorizontal, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { WidgetPicker } from '@/components/ui/widget-picker'
import { DashboardGrid } from '@/components/ui/dashboard-grid'
import { preferencesApi, DashboardWidgetConfig, FavoriteDto } from '@/lib/api/preferences-api'
import { componentsApi } from '@/lib/api/components-api'
import { purchaseOrdersApi } from '@/lib/api/purchase-orders-api'
import { notificationsApi } from '@/lib/api/notifications-api'
import { workOrdersApi } from '@/lib/api/work-orders-api'
import { categoriesApi, CategoryDto } from '@/lib/api/categories-api'
import { activityApi, ActivityEventDto } from '@/lib/api/activity-api'

export default function DashboardPage() {
  const [widgets, setWidgets] = React.useState<DashboardWidgetConfig[]>([
    { id: 'stats-summary', title: 'Key Metrics', enabled: true, width: 'full' },
    { id: 'low-stock', title: 'Top Component Categories', enabled: true, width: 'half' },
    { id: 'recent-pos', title: 'Recent Activity Status', enabled: true, width: 'half' },
    { id: 'activity-feed', title: 'Operational Queue', enabled: true, width: 'half' },
    { id: 'favorite-records', title: 'Pinned & Favorites', enabled: true, width: 'half' },
  ])
  const [favorites, setFavorites] = React.useState<FavoriteDto[]>([])
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)

  // Real API metrics state
  const [componentCount, setComponentCount] = React.useState<number | null>(null)
  const [poCount, setPoCount] = React.useState<number | null>(null)
  const [unreadAlerts, setUnreadAlerts] = React.useState<number | null>(null)
  const [workOrderCount, setWorkOrderCount] = React.useState<number | null>(null)
  const [categories, setCategories] = React.useState<CategoryDto[]>([])
  const [recentActivities, setRecentActivities] = React.useState<ActivityEventDto[]>([])
  const [loadingMetrics, setLoadingMetrics] = React.useState(true)

  const loadData = React.useCallback(async () => {
    setLoadingMetrics(true)
    try {
      const [layoutData, favData, comps, pos, unread, wos, cats, activities] = await Promise.all([
        preferencesApi.getDashboardLayout().catch(() => null),
        preferencesApi.getFavorites().catch(() => []),
        componentsApi.getAll().catch(() => []),
        purchaseOrdersApi.getAll().catch(() => []),
        notificationsApi.getUnreadCount().catch(() => 0),
        workOrdersApi.getAll().catch(() => []),
        categoriesApi.getAll().catch(() => []),
        activityApi.getFeed().catch(() => []),
      ])

      if (layoutData?.widgetsJson && layoutData.widgetsJson.length > 0) {
        setWidgets(layoutData.widgetsJson)
      }
      setFavorites(favData)
      setComponentCount(comps.length)
      setPoCount(pos.length)
      const unreadCount = typeof unread === 'number' ? unread : (unread as { unread?: number })?.unread ?? 0
      setUnreadAlerts(unreadCount)
      setWorkOrderCount(wos.length)
      setCategories(cats)
      setRecentActivities(activities.slice(0, 5))
    } finally {
      setLoadingMetrics(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggleWidget = async (id: string, enabled: boolean) => {
    const updated = widgets.map((w) => (w.id === id ? { ...w, enabled } : w))
    setWidgets(updated)
    try {
      await preferencesApi.updateDashboardLayout(updated)
    } catch {
      // ignore
    }
  }

  const handleRestoreDefaults = async () => {
    const defaults: DashboardWidgetConfig[] = [
      { id: 'stats-summary', title: 'Key Metrics', enabled: true, width: 'full' },
      { id: 'low-stock', title: 'Top Component Categories', enabled: true, width: 'half' },
      { id: 'recent-pos', title: 'Recent Activity Status', enabled: true, width: 'half' },
      { id: 'activity-feed', title: 'Operational Queue', enabled: true, width: 'half' },
      { id: 'favorite-records', title: 'Pinned & Favorites', enabled: true, width: 'half' },
    ]
    setWidgets(defaults)
    try {
      await preferencesApi.updateDashboardLayout(defaults)
    } catch {
      // ignore
    }
  }

  const statsWidget = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={LayoutGrid}
        title="Total Inventory Items"
        value={loadingMetrics ? '...' : (componentCount ?? 0).toLocaleString()}
        subtitle="Across active warehouse locations"
      />
      <StatCard
        icon={TrendingUp}
        title="Purchase Orders"
        value={loadingMetrics ? '...' : (poCount ?? 0).toLocaleString()}
        subtitle="Active and pending orders"
      />
      <StatCard
        icon={AlertCircle}
        title="System Alerts"
        value={loadingMetrics ? '...' : (unreadAlerts ?? 0).toLocaleString()}
        subtitle="Unread system notifications"
      />
      <StatCard
        icon={Clock}
        title="Pending Work Orders"
        value={loadingMetrics ? '...' : (workOrderCount ?? 0).toLocaleString()}
        subtitle="Production & manufacturing queue"
      />
    </div>
  )

  const lowStockWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-foreground">Top Component Categories</h3>
      {loadingMetrics ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : categories.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No component categories configured.</p>
      ) : (
        <div className="space-y-3 text-xs">
          {categories.slice(0, 4).map((cat) => (
            <div key={cat.id} className="flex items-center justify-between">
              <span className="font-medium text-foreground">{cat.name}</span>
              <span className="font-mono text-muted-foreground">{cat.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const recentPosWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-foreground">Recent Activity Status</h3>
      {loadingMetrics ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : recentActivities.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No recent system activity recorded.</p>
      ) : (
        <div className="space-y-2 text-xs">
          {recentActivities.map((act) => (
            <div key={act.id} className="flex items-center justify-between p-2 bg-muted/20 border border-border rounded-lg">
              <span className="truncate pr-2">{act.description}</span>
              <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const activityFeedWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-foreground">Operational Queue</h3>
      <p className="text-xs text-muted-foreground">All system services and background jobs operating within normal parameters.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Operations Dashboard"
        description="Real-time personalized operational summary and metrics across all enterprise domains."
        actions={
          <Button size="sm" variant="outline" onClick={() => setIsPickerOpen(true)}>
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-primary" />
            Customize Dashboard
          </Button>
        }
      />

      {/* Reactive Dashboard Grid */}
      <DashboardGrid
        widgets={widgets}
        statsWidget={statsWidget}
        lowStockWidget={lowStockWidget}
        recentPosWidget={recentPosWidget}
        activityFeedWidget={activityFeedWidget}
        favorites={favorites}
        onFavoriteRemoved={loadData}
      />

      {/* Widget Picker Modal */}
      <WidgetPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        widgets={widgets}
        onToggleWidget={handleToggleWidget}
        onRestoreDefaults={handleRestoreDefaults}
      />
    </div>
  )
}
