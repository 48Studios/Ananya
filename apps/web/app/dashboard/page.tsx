'use client'

import React from 'react'
import { LayoutGrid, TrendingUp, AlertCircle, Clock, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { WidgetPicker } from '@/components/ui/widget-picker'
import { DashboardGrid } from '@/components/ui/dashboard-grid'
import { preferencesApi, DashboardWidgetConfig, FavoriteDto } from '@/lib/api/preferences-api'

export default function DashboardPage() {
  const [widgets, setWidgets] = React.useState<DashboardWidgetConfig[]>([
    { id: 'stats-summary', title: 'Key Metrics', enabled: true, width: 'full' },
    { id: 'low-stock', title: 'Low Stock Inventory', enabled: true, width: 'half' },
    { id: 'recent-pos', title: 'Recent Purchase Orders', enabled: true, width: 'half' },
    { id: 'activity-feed', title: 'Operational Activity Feed', enabled: true, width: 'half' },
    { id: 'favorite-records', title: 'Pinned & Favorites', enabled: true, width: 'half' },
  ])
  const [favorites, setFavorites] = React.useState<FavoriteDto[]>([])
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)

  const loadPreferences = React.useCallback(async () => {
    try {
      const layoutData = await preferencesApi.getDashboardLayout()
      if (layoutData?.widgetsJson && layoutData.widgetsJson.length > 0) {
        setWidgets(layoutData.widgetsJson)
      }
      const favData = await preferencesApi.getFavorites()
      setFavorites(favData)
    } catch {
      // ignore fallback
    }
  }, [])

  React.useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

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
      { id: 'low-stock', title: 'Low Stock Inventory', enabled: true, width: 'half' },
      { id: 'recent-pos', title: 'Recent Purchase Orders', enabled: true, width: 'half' },
      { id: 'activity-feed', title: 'Operational Activity Feed', enabled: true, width: 'half' },
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
        value="2,847"
        subtitle="Across active warehouse locations"
      />
      <StatCard
        icon={TrendingUp}
        title="Purchase Orders"
        value="124"
        subtitle="Active and pending orders"
      />
      <StatCard
        icon={AlertCircle}
        title="System Alerts"
        value="8"
        subtitle="Low stock & reorder notifications"
      />
      <StatCard
        icon={Clock}
        title="Pending Tasks"
        value="23"
        subtitle="Work order & transfer queue"
      />
    </div>
  )

  const lowStockWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-foreground">Top Component Categories</h3>
      <div className="space-y-3 text-xs">
        {[
          { name: 'Electronics', pct: 85 },
          { name: 'Components', pct: 70 },
          { name: 'Raw Materials', pct: 55 },
          { name: 'Accessories', pct: 40 },
        ].map((cat) => (
          <div key={cat.name} className="flex items-center justify-between">
            <span className="font-medium text-foreground">{cat.name}</span>
            <span className="font-mono text-muted-foreground">{cat.pct}% Allocation</span>
          </div>
        ))}
      </div>
    </div>
  )

  const recentPosWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-foreground">Recent Activity Status</h3>
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between p-2 bg-muted/20 border border-border rounded-lg">
          <span>Component #CMP-00481 reserved for Work Order</span>
          <span className="font-mono text-[10px] text-muted-foreground">Just now</span>
        </div>
        <div className="flex items-center justify-between p-2 bg-muted/20 border border-border rounded-lg">
          <span>Purchase Order #PO-2026-000123 submitted</span>
          <span className="font-mono text-[10px] text-muted-foreground">10m ago</span>
        </div>
      </div>
    </div>
  )

  const activityFeedWidget = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-foreground">Operational Queue</h3>
      <p className="text-xs text-muted-foreground">All systems operating within normal performance parameters.</p>
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
        onFavoriteRemoved={loadPreferences}
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
