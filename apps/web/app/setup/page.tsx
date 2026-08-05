'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api/auth-api'
import { Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldLabel } from '@/components/ui/field'


export default function OrganizationSetupPage() {
  const router = useRouter()
  const [step, setStep] = React.useState<1 | 2>(1)
  const [companyName, setCompanyName] = React.useState('')
  const [legalName, setLegalName] = React.useState('')
  const [taxId, setTaxId] = React.useState('')
  const [supportPhone, setSupportPhone] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [website, setWebsite] = React.useState('')
  const [country, setCountry] = React.useState('India')
  const [primaryTimezone, setPrimaryTimezone] = React.useState('Asia/Kolkata')
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
        legalName: legalName || undefined,
        taxId: taxId || undefined,
        supportPhone: supportPhone || undefined,
        address: address || undefined,
        website: website || undefined,
        country: country || undefined,
        primaryTimezone: primaryTimezone || undefined,
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
            <Field>
              <FieldLabel htmlFor="setup-company">
                Organization Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="setup-company"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corporation"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="setup-legal">Legal Entity Name (Optional)</FieldLabel>
                <Input
                  id="setup-legal"
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="e.g. Acme Corp Pvt Ltd"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="setup-tax">GST / Tax ID (Optional)</FieldLabel>
                <Input
                  id="setup-tax"
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="e.g. GSTIN-12345"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="setup-phone">Support Phone (Optional)</FieldLabel>
                <Input
                  id="setup-phone"
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="e.g. +1 555-0199"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="setup-url">Website URL (Optional)</FieldLabel>
                <Input
                  id="setup-url"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="setup-address">HQ Operating Address (Optional)</FieldLabel>
              <Input
                id="setup-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 100 Technology Parkway, Suite 400"
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="setup-country">Country</FieldLabel>
                <Input
                  id="setup-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="setup-tz">Timezone</FieldLabel>
                <Input
                  id="setup-tz"
                  type="text"
                  value={primaryTimezone}
                  onChange={(e) => setPrimaryTimezone(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="setup-currency">Base Currency</FieldLabel>
                <Select value={baseCurrency} onValueChange={(val) => setBaseCurrency(val ?? '')}>
                  <SelectTrigger id="setup-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex justify-end pt-4">
              <Button size="sm" onClick={() => companyName && setStep(2)}>
                Next: Root Administrator &rarr;
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFinishSetup} className="space-y-4 text-xs">
            <div className="p-3 bg-muted/40 rounded-lg space-y-1">
              <p className="font-semibold text-foreground">Root Administrator Credentials</p>
              <p className="text-[11px] text-muted-foreground">
                This account receives full administrative system privileges (`Admin` role) to configure security, roles, and enterprise users.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="admin-fn">First Name</FieldLabel>
                <Input
                  id="admin-fn"
                  type="text"
                  required
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  placeholder="System"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="admin-ln">Last Name</FieldLabel>
                <Input
                  id="admin-ln"
                  type="text"
                  required
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  placeholder="Administrator"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="admin-email">Admin Email Address</FieldLabel>
              <Input
                id="admin-email"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@company.com"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="admin-pw">Admin Master Password</FieldLabel>
              <Input
                id="admin-pw"
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </Field>

            <div className="flex items-center justify-between pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)} disabled={loading}>
                &larr; Back
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Complete Setup & Initialize ERP
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
