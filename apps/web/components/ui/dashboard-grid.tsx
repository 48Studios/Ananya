"use client";

import * as React from "react";
import { DashboardWidgetConfig, FavoriteDto } from "@/lib/api/preferences-api";
import { FavoritesPanel } from "./favorites-panel";

export interface DashboardGridProps {
  widgets: DashboardWidgetConfig[];
  attentionQueueWidget?: React.ReactNode;
  statsWidget?: React.ReactNode;
  healthChartsWidget?: React.ReactNode;
  recentActivityWidget?: React.ReactNode;
  quickActionsWidget?: React.ReactNode;
  favoritesWidget?: React.ReactNode;
  // Legacy / backward compatibility
  lowStockWidget?: React.ReactNode;
  recentPosWidget?: React.ReactNode;
  activityFeedWidget?: React.ReactNode;
  favorites?: FavoriteDto[];
  onFavoriteRemoved?: () => void;
}

export function DashboardGrid({
  widgets,
  attentionQueueWidget,
  statsWidget,
  healthChartsWidget,
  recentActivityWidget,
  quickActionsWidget,
  favoritesWidget,
  lowStockWidget,
  recentPosWidget,
  activityFeedWidget,
  favorites = [],
  onFavoriteRemoved,
}: DashboardGridProps) {
  const isWidgetEnabled = (id: string) => {
    const found = widgets.find((w) => w.id === id);
    return found ? found.enabled : true;
  };

  return (
    <div className="space-y-6">
      {/* 1. Attention Queue Widget (Critical Operations Triage) */}
      {attentionQueueWidget && isWidgetEnabled("attention-queue") && (
        <div>{attentionQueueWidget}</div>
      )}

      {/* 2. Key Metrics Widget */}
      {statsWidget && isWidgetEnabled("stats-summary") && <div>{statsWidget}</div>}

      {/* 3. Operational Health & Distribution Charts */}
      {healthChartsWidget && isWidgetEnabled("health-charts") && (
        <div>{healthChartsWidget}</div>
      )}

      {/* 4. Quick Actions Widget */}
      {quickActionsWidget && isWidgetEnabled("quick-actions") && (
        <div>{quickActionsWidget}</div>
      )}

      {/* 5. Split Section: Recent Activity & Pinned Favorites */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(recentActivityWidget || activityFeedWidget) &&
          (isWidgetEnabled("recent-activity") || isWidgetEnabled("activity-feed")) && (
            <div>{recentActivityWidget || activityFeedWidget}</div>
          )}

        {(favoritesWidget || favorites.length > 0) &&
          (isWidgetEnabled("favorite-records") || isWidgetEnabled("favorites")) && (
            <div>
              {favoritesWidget || (
                <FavoritesPanel
                  favorites={favorites}
                  onFavoriteRemoved={onFavoriteRemoved}
                />
              )}
            </div>
          )}

        {/* Legacy slot support */}
        {lowStockWidget && isWidgetEnabled("low-stock") && <div>{lowStockWidget}</div>}
        {recentPosWidget && isWidgetEnabled("recent-pos") && <div>{recentPosWidget}</div>}
      </div>
    </div>
  );
}
