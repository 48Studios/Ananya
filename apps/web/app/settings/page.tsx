'use client'

import * as React from 'react'
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
    <PermissionGuard permission="Administration.Settings">
      <div className="space-y-6">
        <PageHeader
          title="Administration & Settings"
          description="Configure enterprise organization profile, system defaults, numbering series, and feature flags."
        />

        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Settings Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('organization')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'organization'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Organization Profile
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'system'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            System Defaults
          </button>
          <button
            onClick={() => setActiveTab('numbering')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'numbering'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            Numbering Series
          </button>
          <button
            onClick={() => setActiveTab('flags')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'flags'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            Feature Flags
          </button>
        </div>

        {/* Tab Contents */}
        {loading ? (
          <LoadingState message="Loading System Settings..." />
        ) : error ? (
          <ErrorState title="Error Loading Settings" message={error} onRetry={loadData} />
        ) : (
          <div className="space-y-6">
            {/* Organization Tab */}
            {activeTab === 'organization' && profile && (
              <div className="p-6 bg-card border border-border rounded-xl space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b border-border/40 pb-2">
                  Organization Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Company Name</label>
                    <input
                      type="text"
                      value={profile.companyName}
                      onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Tax ID / GSTIN</label>
                    <input
                      type="text"
                      value={profile.taxId || ''}
                      onChange={(e) => setProfile({ ...profile, taxId: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Legal Address</label>
                    <textarea
                      rows={2}
                      value={profile.address || ''}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Primary Email</label>
                    <input
                      type="email"
                      value={profile.email || ''}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Support Phone</label>
                    <input
                      type="text"
                      value={profile.phone || ''}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={handleSaveOrganization} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save Organization Profile
                  </Button>
                </div>
              </div>
            )}

            {/* System Tab */}
            {activeTab === 'system' && system && (
              <div className="p-6 bg-card border border-border rounded-xl space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b border-border/40 pb-2">
                  System Defaults
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Base Currency</label>
                    <input
                      type="text"
                      value={system.baseCurrency}
                      onChange={(e) => setSystem({ ...system, baseCurrency: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Default Warehouse ID</label>
                    <input
                      type="text"
                      value={system.defaultWarehouseId || ''}
                      onChange={(e) => setSystem({ ...system, defaultWarehouseId: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Fiscal Year Start Month</label>
                    <select
                      value={system.fiscalYearStartMonth}
                      onChange={(e) => setSystem({ ...system, fiscalYearStartMonth: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                    >
                      <option value={1}>January</option>
                      <option value={4}>April</option>
                      <option value={10}>October</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">DateFormat</label>
                    <input
                      type="text"
                      value={system.dateFormat}
                      onChange={(e) => setSystem({ ...system, dateFormat: e.target.value })}
                      className="w-full px-3 py-2 bg-input/50 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={handleSaveSystem} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save System Defaults
                  </Button>
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
  )
}
