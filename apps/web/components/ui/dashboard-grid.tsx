"use client";

import * as React from "react";
import { DashboardWidgetConfig, FavoriteDto } from "@/lib/api/preferences-api";
import { FavoritesPanel } from "./favorites-panel";

export interface DashboardGridProps {
  widgets: DashboardWidgetConfig[];
  attentionQueueWidget?: React.ReactNode;
  statsWidget?: React.ReactNode;
  healthChartsWidget?: React.ReactNode;
  operationsPipelineWidget?: React.ReactNode;
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
  operationsPipelineWidget,
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

  const hasActivity = Boolean(recentActivityWidget || activityFeedWidget);
  const hasPipeline = Boolean(operationsPipelineWidget);
  const hasFavorites = Boolean(favoritesWidget || favorites.length > 0);

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

      {/* 5. Two-Column Split: Recent Activity (Left) & Operations Execution Pipeline (Right) */}
      {(hasActivity || hasPipeline) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {hasActivity &&
            (isWidgetEnabled("recent-activity") || isWidgetEnabled("activity-feed")) && (
              <div>{recentActivityWidget || activityFeedWidget}</div>
            )}

          {hasPipeline && isWidgetEnabled("operations-pipeline") && (
            <div>{operationsPipelineWidget}</div>
          )}
        </div>
      )}

      {/* 6. Pinned & Favorites Section (When user has favorites) */}
      {hasFavorites &&
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

      {/* Legacy slots support */}
      {lowStockWidget && isWidgetEnabled("low-stock") && <div>{lowStockWidget}</div>}
      {recentPosWidget && isWidgetEnabled("recent-pos") && <div>{recentPosWidget}</div>}
    </div>
  );
}
