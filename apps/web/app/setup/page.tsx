'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api/auth-api'
import { Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OrganizationSetupPage() {
  const router = useRouter()
  const [step, setStep] = React.useState<1 | 2>(1)
  const [companyName, setCompanyName] = React.useState('')
  const [legalName, setLegalName] = React.useState('')
  const [taxId, setTaxId] = React.useState('')
  const [baseCurrency, setBaseCurrency] = React.useState('INR')

  const [adminEmail, setAdminEmail] = React.useState('')
  const [adminPassword, setAdminPassword] = React.useState('')
  const [adminFirstName, setAdminFirstName] = React.useState('')
  const [adminLastName, setAdminLastName] = React.useState('')

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleFinishSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await authApi.setupOrganization({
        companyName,
        legalName,
        taxId,
        adminEmail,
        adminPassword,
        adminFirstName,
        adminLastName,
        baseCurrency,
      })
      router.push('/login')
    } catch {
      setError('Setup failed or organization already initialized.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-lg bg-card border border-border p-6 rounded-xl shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Organization Setup Wizard</h2>
              <p className="text-xs text-muted-foreground">Step {step} of 2 — First-time ERP initialization</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded font-mono">
            {step === 1 ? '50%' : '100%'}
          </span>
        </div>

        {error && (
          <div className="p-3 text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
            {error}
          </div>
        )}

        {step === 1 ? (
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-foreground">Organization Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="48 Studios"
                className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div>
              <label className="font-semibold text-foreground">Legal Entity Name</label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="48 Studios Pvt Ltd"
                className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground">GST / Tax ID</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="GSTIN..."
                  className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary font-mono text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground">Base Currency</label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep(2)}>
              Next: Administrator Account →
            </Button>
          </div>
        ) : (
          <form onSubmit={handleFinishSetup} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground">Admin First Name</label>
                <input
                  type="text"
                  required
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground">Admin Last Name</label>
                <input
                  type="text"
                  required
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground">Root Administrator Email</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@48studios.com"
                className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div>
              <label className="font-semibold text-foreground">Root Administrator Password</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Complete Setup & Launch ERP
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
