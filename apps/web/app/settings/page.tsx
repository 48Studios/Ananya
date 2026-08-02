'use client'

import * as React from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { PageHeader } from '@/components/ui/page-header'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { PermissionGuard } from '@/lib/auth/auth-context'
import { NumberingSeriesEditor } from '@/components/ui/numbering-series-editor'
import { FeatureFlagTable } from '@/components/ui/feature-flag-table'
import {
  settingsApi,
  OrganizationProfileDto,
  SystemSettingsDto,
  NumberingSeriesDto,
  FeatureFlagDto,
} from '@/lib/api/settings-api'
import {
  Building2,
  Sliders,
  Hash,
  Flag,
  Save,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<
    'organization' | 'system' | 'numbering' | 'flags'
  >('organization')

  const [profile, setProfile] = React.useState<OrganizationProfileDto | null>(null)
  const [system, setSystem] = React.useState<SystemSettingsDto | null>(null)
  const [numbering, setNumbering] = React.useState<NumberingSeriesDto[]>([])
  const [flags, setFlags] = React.useState<FeatureFlagDto[]>([])

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profData, sysData, numData, flagData] = await Promise.all([
        settingsApi.getOrganizationProfile(),
        settingsApi.getSystemSettings(),
        settingsApi.getNumberingSeries(),
        settingsApi.getFeatureFlags(),
      ])
      setProfile(profData)
      setSystem(sysData)
      setNumbering(numData)
      setFlags(flagData)
    } catch {
      setError('Failed to load system settings configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleSaveOrganization = async () => {
    if (!profile) return
    setSaving(true)
    setSuccessMsg(null)
    try {
      await settingsApi.updateOrganizationProfile(profile)
      setSuccessMsg('Organization legal profile updated successfully!')
    } catch {
      setError('Failed to update organization profile.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSystem = async () => {
    if (!system) return
    setSaving(true)
    setSuccessMsg(null)
    try {
      await settingsApi.updateSystemSettings(system)
      setSuccessMsg('System defaults and fiscal settings updated!')
    } catch {
      setError('Failed to update system settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <PermissionGuard permission="Administration.Settings">
        <div className="space-y-6">
          <PageHeader
            title="Organization & System Administration"
            description="Centralized administrative control center for legal profile, currency, fiscal parameters, numbering series, and feature toggles."
            breadcrumbs={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Administration Settings', href: '/settings' },
            ]}
          />

          {/* Settings Tabs */}
          <div className="flex border-b border-border gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('organization')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'organization'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Organization Profile
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'system'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders className="w-4 h-4" />
              System Defaults
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('numbering')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'numbering'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Hash className="w-4 h-4" />
              Numbering Series
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('flags')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'flags'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Flag className="w-4 h-4" />
              Feature Flags
            </button>
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <LoadingState message="Loading System Configuration..." />
          ) : error ? (
            <ErrorState title="Error Loading Settings" message={error} onRetry={loadData} />
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 shadow-2xs">
              {/* Organization Tab */}
              {activeTab === 'organization' && profile && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Legal Company Profile</h3>
                    <Button size="sm" onClick={handleSaveOrganization} disabled={saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save Profile
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-semibold text-foreground">Company Name</label>
                      <input
                        type="text"
                        value={profile.companyName}
                        onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                        className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md outline-none text-foreground"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-foreground">Legal Entity Name</label>
                      <input
                        type="text"
                        value={profile.legalName}
                        onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
                        className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md outline-none text-foreground"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-foreground">Tax ID / GSTIN</label>
                      <input
                        type="text"
                        value={profile.taxId}
                        onChange={(e) => setProfile({ ...profile, taxId: e.target.value })}
                        className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md outline-none text-foreground font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-foreground">Support Email</label>
                      <input
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md outline-none text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* System Defaults Tab */}
              {activeTab === 'system' && system && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Global System Defaults</h3>
                    <Button size="sm" onClick={handleSaveSystem} disabled={saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save Defaults
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-semibold text-foreground">Base Currency</label>
                      <select
                        value={system.baseCurrency}
                        onChange={(e) => setSystem({ ...system, baseCurrency: e.target.value })}
                        className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md outline-none text-foreground"
                      >
                        <option value="INR">INR (₹)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-foreground">Date Format</label>
                      <select
                        value={system.dateFormat}
                        onChange={(e) => setSystem({ ...system, dateFormat: e.target.value })}
                        className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md outline-none text-foreground font-mono"
                      >
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Numbering Series Tab */}
              {activeTab === 'numbering' && (
                <NumberingSeriesEditor seriesList={numbering} onSeriesUpdated={loadData} />
              )}

              {/* Feature Flags Tab */}
              {activeTab === 'flags' && (
                <FeatureFlagTable flags={flags} onFlagToggled={loadData} />
              )}
            </div>
          )}
        </div>
      </PermissionGuard>
    </DashboardLayout>
  )
}
