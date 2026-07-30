'use client'

import { LayoutGrid, TrendingUp, AlertCircle, Clock } from 'lucide-react'

function StatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode
  label: string
  value: string
  description: string
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground mb-2">{value}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Get a complete overview of your enterprise operations.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<LayoutGrid className="w-5 h-5" />}
          label="Total Inventory Items"
          value="2,847"
          description="Across all warehouses"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Purchase Orders"
          value="124"
          description="Active and pending"
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          label="Alerts"
          value="8"
          description="Requires attention"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Pending Tasks"
          value="23"
          description="In progress"
        />
      </div>

      {/* Charts and Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart Placeholder */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Inventory Trends
          </h2>
          <div className="h-64 bg-input rounded flex items-center justify-center">
            <p className="text-muted-foreground">Chart will render here</p>
          </div>
        </div>

        {/* Stats Placeholder */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Top Categories
          </h2>
          <div className="space-y-3">
            {['Electronics', 'Components', 'Raw Materials', 'Accessories'].map(
              (category, i) => (
                <div key={category} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{category}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-input rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sidebar-primary rounded-full"
                        style={{
                          width: `${100 - i * 15}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {100 - i * 15}%
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {[
            { action: 'Inventory updated', time: '2 hours ago' },
            { action: 'Purchase order created', time: '4 hours ago' },
            { action: 'Stock received', time: '1 day ago' },
            { action: 'Report generated', time: '2 days ago' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-sidebar-primary flex-shrink-0" />
                <p className="text-sm text-foreground">{item.action}</p>
              </div>
              <p className="text-xs text-muted-foreground">{item.time}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
