'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api/auth-api'
import { Building2, CheckCircle2, ArrowRight, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CreateOrganizationPage() {
  const router = useRouter()
  const [step, setStep] = React.useState<1 | 2>(1)

  // Step 1: Account Information
  const [adminFirstName, setAdminFirstName] = React.useState('')
  const [adminLastName, setAdminLastName] = React.useState('')
  const [adminEmail, setAdminEmail] = React.useState('')
  const [adminPassword, setAdminPassword] = React.useState('')

  // Step 2: Organization Details
  const [companyName, setCompanyName] = React.useState('')
  const [legalName, setLegalName] = React.useState('')
  const [taxId, setTaxId] = React.useState('')
  const [supportPhone, setSupportPhone] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [website, setWebsite] = React.useState('')
  const [country, setCountry] = React.useState('India')
  const [primaryTimezone, setPrimaryTimezone] = React.useState('Asia/Kolkata')
  const [baseCurrency, setBaseCurrency] = React.useState('INR')

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.setupOrganization({
        companyName,
        legalName: legalName || undefined,
        taxId: taxId || undefined,
        supportPhone: supportPhone || undefined,
        address: address || undefined,
        website: website || undefined,
        country: country || undefined,
        primaryTimezone: primaryTimezone || undefined,
        baseCurrency,
        adminEmail,
        adminPassword,
        adminFirstName,
        adminLastName,
      })

      if (res.token) {
        localStorage.setItem('ananya_auth_token', res.token)
        document.cookie = `ananya_auth_token=${res.token}; path=/; max-age=604800; SameSite=Lax`
      } else {
        await authApi.login(adminEmail, adminPassword)
      }
      router.push('/dashboard')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to create organization. It may already exist.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-lg bg-card border border-border p-6 rounded-2xl shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Create New Organization</h2>
              <p className="text-xs text-muted-foreground">Step {step} of 2 — No invitation token required</p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full font-mono">
            {step === 1 ? 'Step 1: Owner Account' : 'Step 2: Organization'}
          </span>
        </div>

        {error && (
          <div className="p-3 text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (adminFirstName && adminLastName && adminEmail && adminPassword) {
                setStep(2)
              }
            }}
            className="space-y-4 text-xs"
          >
            <div className="p-3 bg-muted/40 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>Organization Owner Account</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                You will be designated as the Organization Owner with full administrative permissions (`Admin` role).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground block mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  placeholder="Jane"
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  placeholder="Smith"
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground block mb-1">Email Address</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="owner@company.com"
                className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div>
              <label className="font-semibold text-foreground block mb-1">Create Account Password</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Link href="/onboarding">
                <Button type="button" variant="ghost" size="sm">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm">
                Next: Organization Details
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCreateOrganization} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-foreground block mb-1">Organization Name (Required)</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Apex Hardware Technologies"
                className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground block mb-1">Legal Entity Name (Optional)</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Apex Hardware Inc."
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">GST / Tax ID (Optional)</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="TAX-998877"
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground block mb-1">Support Phone (Optional)</label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="+1 555-0100"
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Website (Optional)</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://apex.hardware"
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground block mb-1">Operating Address (Optional)</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="400 Innovation Drive"
                className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-foreground block mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Timezone</label>
                <input
                  type="text"
                  value={primaryTimezone}
                  onChange={(e) => setPrimaryTimezone(e.target.value)}
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Base Currency</label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full h-9 px-3 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)} disabled={loading}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Back
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Creating Organization...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Create Organization & Launch
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
