'use client'

import * as React from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { AuditTable } from '@/components/ui/activity-timeline'
import { activityApi, SecurityAuditLogDto } from '@/lib/api/activity-api'
import { Shield, Lock, Search, Filter, KeyRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { PermissionGuard } from '@/lib/auth/auth-context'

export default function AuditExplorerPage() {
  const [logs, setLogs] = React.useState<SecurityAuditLogDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [module, setModule] = React.useState('')
  const [search, setSearch] = React.useState('')

  const loadAuditTrail = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await activityApi.getAuditTrail({
        module: module || undefined,
        search: search.trim() || undefined,
        limit: 100,
      })
      setLogs(data)
    } catch {
      setError('Failed to load audit trail logs. Using offline state.')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [module, search])

  React.useEffect(() => {
    loadAuditTrail()
  }, [loadAuditTrail])

  const totalLogs = logs.length
  const authLogs = logs.filter((l) => l.category === 'Authentication' || l.action.includes('LOGIN')).length
  const adminLogs = logs.filter((l) => l.category === 'Administration' || l.category === 'Security').length

  return (
    <PermissionGuard permission="Administration.Security">
      <div className="space-y-6">
        <PageHeader
          title="Audit Explorer"
          description="Enterprise compliance audit log tracking system access, permission changes, and security events."
        />

        {/* Audit Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Audit Logs"
            value={totalLogs.toString()}
            subtitle="Recorded security events"
            icon={Shield}
          />
          <StatCard
            title="Auth Operations"
            value={authLogs.toString()}
            subtitle="Logins, logouts & password resets"
            icon={Lock}
          />
          <StatCard
            title="Security & Admin Changes"
            value={adminLogs.toString()}
            subtitle="Role & permission adjustments"
            icon={KeyRound}
          />
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-card border border-border rounded-xl shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audit trail (action, user email, category)..."
              className="pl-9 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <Select
              value={module || 'ALL'}
              onValueChange={(val) => setModule(!val || val === 'ALL' ? '' : val)}
            >
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="Authentication">Authentication</SelectItem>
                <SelectItem value="Administration">Administration</SelectItem>
                <SelectItem value="Security">Security</SelectItem>
                <SelectItem value="Inventory">Inventory</SelectItem>
                <SelectItem value="Procurement">Procurement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audit Table */}
        {loading ? (
          <LoadingState message="Loading Audit Trail... Querying security audit logs." />
        ) : error ? (
          <ErrorState title="Error Loading Audit Trail" message={error} onRetry={loadAuditTrail} />
        ) : (
          <AuditTable logs={logs} />
        )}
      </div>
    </PermissionGuard>
  )
}

