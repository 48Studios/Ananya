'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  User,
  Shield,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Loader2,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { PermissionGuard } from '@/lib/auth/auth-context'
import { usersApi } from '@/lib/api/users-api'
import { auditApi, SecurityAuditLogDto } from '@/lib/api/audit-api'
import { UserProfileDto } from '@/lib/api/auth-api'

export default function UserDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [userInfo, setUserInfo] = React.useState<UserProfileDto | null>(null)
  const [auditLogs, setAuditLogs] = React.useState<SecurityAuditLogDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Reset Password Modal
  const [isResetOpen, setIsResetOpen] = React.useState(false)
  const [newPassword, setNewPassword] = React.useState('')
  const [resetSubmitting, setResetSubmitting] = React.useState(false)
  const [resetSuccess, setResetSuccess] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [uData, logs] = await Promise.all([
        usersApi.getById(id),
        auditApi.getLogs(undefined, id).catch(() => []),
      ])
      setUserInfo(uData)
      setAuditLogs(logs)
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message)
      else setError('Failed to load user details.')
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetSubmitting(true)
    setResetSuccess(null)
    try {
      await usersApi.adminResetPassword(id, newPassword)
      setResetSuccess('User password has been reset.')
      setNewPassword('')
      setTimeout(() => setIsResetOpen(false), 1500)
    } catch {
      // Ignore
    } finally {
      setResetSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingState message="Fetching user security profile..." />
  }

  if (error || !userInfo) {
    return (
      <ErrorState
        title="User Account Error"
        message={error || 'User profile not found.'}
        onRetry={loadData}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`${userInfo.firstName} ${userInfo.lastName}`}
        description={`Work Email: ${userInfo.email} | Department: ${userInfo.department || 'General'}`}
        breadcrumbs={[
          { label: 'Users', href: '/users' },
          { label: `${userInfo.firstName} ${userInfo.lastName}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/users">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Users
              </Button>
            </Link>
            <PermissionGuard permission="Administration.Users">
              <Button size="sm" onClick={() => setIsResetOpen(true)}>
                <Lock className="w-4 h-4 mr-1.5" />
                Reset Password
              </Button>
            </PermissionGuard>
          </div>
        }
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Account Status"
          value={userInfo.status}
          subtitle={userInfo.status === 'ACTIVE' ? 'Authenticated' : 'Locked'}
          icon={User}
        />
        <StatCard
          title="Assigned Role"
          value={userInfo.roleName}
          subtitle={`${userInfo.permissions.length} granted permissions`}
          icon={Shield}
        />
        <StatCard
          title="Department"
          value={userInfo.department || 'Operations'}
          subtitle="Organization Unit"
          icon={User}
        />
        <StatCard
          title="Last Login"
          value={
            userInfo.lastLoginAt
              ? new Date(userInfo.lastLoginAt).toLocaleDateString()
              : 'Never'
          }
          subtitle="Authentication event"
          icon={Calendar}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Granted Permissions Matrix */}
        <div className="lg:col-span-2 space-y-4 bg-card border border-border rounded-xl p-6 shadow-xs">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">
              Effective Permissions Matrix ({userInfo.permissions.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permissions inherited from role: <span className="font-semibold text-foreground">{userInfo.roleName}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {userInfo.permissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No permissions assigned.</p>
            ) : (
              userInfo.permissions.map((perm) => (
                <div
                  key={perm}
                  className="p-2.5 bg-muted/20 border border-border rounded-lg flex items-center gap-2 text-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="font-mono text-foreground font-semibold">{perm}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Security Audit History */}
        <div className="space-y-4 bg-card border border-border rounded-xl p-6 shadow-xs">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">Security Log</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Audit trail for this account
            </p>
          </div>

          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No security audit logs recorded.
              </p>
            ) : (
              auditLogs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-muted/20 border border-border rounded-lg text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-foreground">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    IP: {log.ipAddress || '127.0.0.1'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Admin Reset Password Modal */}
      {isResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">
              Reset Password for {userInfo.firstName}
            </h3>

            {resetSuccess && (
              <div className="p-3 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-md">
                {resetSuccess}
              </div>
            )}

            <form onSubmit={handleAdminResetPassword} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-foreground">New Temporary Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-input/40 border border-border rounded-md outline-none text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsResetOpen(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" type="submit" disabled={resetSubmitting}>
                  {resetSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Set New Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
