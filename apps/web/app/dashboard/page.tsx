'use client'

import React from 'react'
import { LayoutGrid, TrendingUp, AlertCircle, Clock } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Operations Dashboard"
        description="Real-time operational summary and metrics across all enterprise domains."
      />

      {/* Stats Grid */}
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

      {/* Charts and Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-foreground">
            Top Component Categories
          </h2>
          <div className="space-y-3">
            {[
              { name: 'Electronics', pct: 85 },
              { name: 'Components', pct: 70 },
              { name: 'Raw Materials', pct: 55 },
              { name: 'Accessories', pct: 40 },
            ].map((cat) => (
              <div key={cat.name} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{cat.name}</span>
                <div className="flex items-center gap-3 w-1/2">
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${cat.pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-muted-foreground w-8 text-right">
                    {cat.pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Operational Overview Widget */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-foreground">
            System Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-1">
              <p className="font-bold text-foreground">Inventory Search</p>
              <p className="text-[11px] text-muted-foreground">Scan or query active components</p>
            </div>
            <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-1">
              <p className="font-bold text-foreground">Purchase Order</p>
              <p className="text-[11px] text-muted-foreground">Issue draft purchase request</p>
            </div>
            <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-1">
              <p className="font-bold text-foreground">Stock Transfer</p>
              <p className="text-[11px] text-muted-foreground">Move inventory between bins</p>
            </div>
            <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-1">
              <p className="font-bold text-foreground">Cycle Count</p>
              <p className="text-[11px] text-muted-foreground">Execute location verification</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
