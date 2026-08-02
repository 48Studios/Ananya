'use client'

import * as React from 'react'
import { DashboardWidgetConfig, FavoriteDto } from '@/lib/api/preferences-api'
import { FavoritesPanel } from './favorites-panel'

export interface DashboardGridProps {
  widgets: DashboardWidgetConfig[]
  statsWidget: React.ReactNode
  lowStockWidget: React.ReactNode
  recentPosWidget: React.ReactNode
  activityFeedWidget: React.ReactNode
  favorites: FavoriteDto[]
  onFavoriteRemoved?: () => void
}

export function DashboardGrid({
  widgets,
  statsWidget,
  lowStockWidget,
  recentPosWidget,
  activityFeedWidget,
  favorites,
  onFavoriteRemoved,
}: DashboardGridProps) {
  const isWidgetEnabled = (id: string) => {
    const found = widgets.find((w) => w.id === id)
    return found ? found.enabled : true
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Widget */}
      {isWidgetEnabled('stats-summary') && <div>{statsWidget}</div>}

      {/* Grid Layout for Half-Width Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isWidgetEnabled('low-stock') && <div>{lowStockWidget}</div>}
        {isWidgetEnabled('recent-pos') && <div>{recentPosWidget}</div>}
        {isWidgetEnabled('activity-feed') && <div>{activityFeedWidget}</div>}
        {isWidgetEnabled('favorite-records') && (
          <div>
            <FavoritesPanel favorites={favorites} onFavoriteRemoved={onFavoriteRemoved} />
          </div>
        )}
      </div>
    </div>
  )
}
