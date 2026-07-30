'use client'

import React from 'react'
import { QuickStat } from '../types'

interface SidebarQuickStatsProps {
  stats: QuickStat[]
  isCollapsed: boolean
}

export function SidebarQuickStats({ stats, isCollapsed }: SidebarQuickStatsProps) {
  if (isCollapsed || !stats || stats.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-2 px-3 py-1">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="bg-sidebar-accent/30 border border-sidebar-border/60 rounded-lg p-2 flex flex-col justify-center"
        >
          <span className="text-[10px] font-semibold text-muted-foreground/80 truncate uppercase tracking-wider">
            {stat.label}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xs font-semibold text-sidebar-foreground">
              {stat.value}
            </span>
            {stat.change && (
              <span
                className={`text-[9px] font-medium ${
                  stat.trend === 'up'
                    ? 'text-emerald-500'
                    : stat.trend === 'down'
                    ? 'text-amber-500'
                    : 'text-muted-foreground'
                }`}
              >
                {stat.change}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
