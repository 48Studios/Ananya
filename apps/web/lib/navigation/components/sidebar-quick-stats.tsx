'use client'

import React, { useState, useEffect } from 'react'
import { QuickStat } from '../types'
import { reportingApi } from '@/lib/api/reporting-api'

interface SidebarQuickStatsProps {
  stats?: QuickStat[]
  moduleId?: string
  isCollapsed: boolean
}

export function SidebarQuickStats({
  stats: initialStats,
  moduleId,
  isCollapsed,
}: SidebarQuickStatsProps) {
  const [stats, setStats] = useState<QuickStat[]>(initialStats || [])

  useEffect(() => {
    if (isCollapsed || !moduleId) return
    let isMounted = true

    const fetchStats = async () => {
      try {
        if (moduleId === 'inventory') {
          const res = await reportingApi.getInventorySummary()
          if (isMounted) {
            setStats([
              { id: 'inv-skus', label: 'Total SKUs', value: res.totalComponents },
              { id: 'inv-resv', label: 'Reserved Stock', value: res.reservedQuantity },
            ])
          }
        } else if (moduleId === 'procurement') {
          const res = await reportingApi.getProcurementSummary()
          if (isMounted) {
            setStats([
              { id: 'proc-pos', label: 'Purchase Orders', value: res.totalPurchaseOrders },
              { id: 'proc-rec', label: 'Goods Receipts', value: res.totalGoodsReceipts },
            ])
          }
        } else if (moduleId === 'manufacturing') {
          const res = await reportingApi.getManufacturingSummary()
          if (isMounted) {
            setStats([
              { id: 'mfg-wos', label: 'Work Orders', value: res.totalWorkOrders },
              { id: 'mfg-boms', label: 'Active BOMs', value: res.activeBoms },
            ])
          }
        } else if (moduleId === 'projects') {
          const res = await reportingApi.getProjectSummary()
          if (isMounted) {
            setStats([
              { id: 'proj-total', label: 'Total Projects', value: res.totalProjects },
              { id: 'proj-act', label: 'Active Projects', value: res.activeProjects },
            ])
          }
        } else if (moduleId === 'dashboard') {
          const res = await reportingApi.getOverview()
          if (isMounted) {
            setStats([
              { id: 'dash-comp', label: 'Components', value: res.totalComponents },
              { id: 'dash-pos', label: 'POs Tracked', value: res.totalPurchaseOrders },
            ])
          }
        }
      } catch {
        if (isMounted) setStats([])
      }
    }

    fetchStats()
    return () => {
      isMounted = false
    }
  }, [moduleId, isCollapsed])

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
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
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
