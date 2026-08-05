'use client'

import * as React from 'react'
import {
  User,
  Shield,
  KeyRound,
  Laptop,
  Trash2,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuth } from '@/lib/auth/auth-context'
import { authApi, SessionDto } from '@/lib/api/auth-api'

export default function ProfilePage() {
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()

  const [sessions, setSessions] = React.useState<SessionDto[]>([])
  const [loadingSessions, setLoadingSessions] = React.useState(true)

  // Change Password Form
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [passwordLoading, setPasswordLoading] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null)

  const loadSessions = React.useCallback(async () => {
    setLoadingSessions(true)
    try {
      const data = await authApi.getSessions()
      setSessions(data)
    } catch {
      // Ignore
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  React.useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    setPasswordLoading(true)
    setPasswordError(null)
    setPasswordSuccess(null)
    try {
      await authApi.changePassword({ currentPassword, newPassword })
      setPasswordSuccess('Password successfully updated!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      if (err instanceof Error) setPasswordError(err.message)
      else setPasswordError('Failed to change password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await authApi.revokeSession(sessionId)
      await loadSessions()
    } catch {
      // Ignore
    }
  }

  const handleRevokeOtherSessions = async () => {
    try {
      await authApi.revokeOtherSessions()
      await loadSessions()
    } catch {
      // Ignore
    }
  }

  if (!user) {
    return <LoadingState message="Loading profile details..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="User Profile & Security Settings"
        description="Manage your account profile, theme preferences, active sessions, and credentials."
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Account Name"
          value={`${user.firstName} ${user.lastName}`}
          subtitle={user.email}
          icon={User}
        />
        <StatCard
          title="Assigned Role"
          value={user.roleName || 'User'}
          subtitle={`${user.permissions?.length || 0} granted permissions`}
          icon={Shield}
        />
        <StatCard
          title="Department"
          value={user.department || 'Operations'}
          subtitle="Organization Unit"
          icon={User}
        />
        <StatCard
          title="Active Sessions"
          value={sessions.length}
          subtitle="Signed-in devices"
          icon={Laptop}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card & Password Update */}
        <div className="lg:col-span-2 space-y-6">
          {/* User Details Form */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Personal Information
              </h3>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 mr-1" />
                ) : (
                  <Moon className="w-3.5 h-3.5 mr-1" />
                )}
                Theme: {theme === 'dark' ? 'Dark' : 'Light'}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <Field>
                <FieldLabel>First Name</FieldLabel>
                <Input
                  type="text"
                  disabled
                  value={user.firstName}
                  className="bg-muted/40 font-medium"
                />
              </Field>

              <Field>
                <FieldLabel>Last Name</FieldLabel>
                <Input
                  type="text"
                  disabled
                  value={user.lastName}
                  className="bg-muted/40 font-medium"
                />
              </Field>

              <Field>
                <FieldLabel>Work Email</FieldLabel>
                <Input
                  type="email"
                  disabled
                  value={user.email}
                  className="bg-muted/40 font-medium font-mono"
                />
              </Field>

              <Field>
                <FieldLabel>Department</FieldLabel>
                <Input
                  type="text"
                  disabled
                  value={user.department || 'Operations'}
                  className="bg-muted/40 font-medium"
                />
              </Field>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                Change Password
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Update your account password for enhanced session security.
              </p>
            </div>

            {passwordError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <Field>
                <FieldLabel>Current Password</FieldLabel>
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>New Password</FieldLabel>
                  <Input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel>Confirm New Password</FieldLabel>
                  <Input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" type="submit" disabled={passwordLoading}>
                  {passwordLoading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Active User Sessions */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Active Sessions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently signed-in devices
                </p>
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={handleRevokeOtherSessions}
                className="text-destructive hover:text-destructive"
              >
                Revoke Others
              </Button>
            </div>

            <div className="space-y-3">
              {loadingSessions ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Loading active sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No active session records found.
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-muted/20 border border-border rounded-lg flex items-center justify-between text-xs space-y-1"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-primary" />
                        <span className="font-semibold text-foreground">
                          {s.deviceInfo || 'Web App Browser'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        IP: {s.ipAddress || '127.0.0.1'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Expires: {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRevokeSession(s.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
