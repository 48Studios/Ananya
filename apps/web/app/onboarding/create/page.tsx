'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api/auth-api'
import { Building2, CheckCircle2, ArrowRight, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
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

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!adminFirstName.trim() || !adminLastName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setError('Please complete all account administrator details.')
      return
    }

    setStep(2)
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!companyName.trim()) {
      setError('Organization Name is required.')
      return
    }

    setLoading(true)

    try {
      await authApi.setupOrganization({
        companyName: companyName.trim(),
        legalName: legalName.trim() || undefined,
        taxId: taxId.trim() || undefined,
        supportPhone: supportPhone.trim() || undefined,
        address: address.trim() || undefined,
        website: website.trim() || undefined,
        country: country.trim() || 'India',
        primaryTimezone: primaryTimezone.trim() || 'Asia/Kolkata',
        baseCurrency: baseCurrency.trim() || 'INR',
        adminFirstName: adminFirstName.trim(),
        adminLastName: adminLastName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword: adminPassword.trim(),
      })

      router.push('/dashboard')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to initialize organization profile.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-foreground">
          Create New Organization
        </h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Step {step} of 2 — {step === 1 ? 'Root Administrator Account' : 'Organization Setup'}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-card py-8 px-4 shadow-xl border border-border sm:rounded-2xl sm:px-8 space-y-6">
          {error && (
            <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleStep1Next} className="space-y-4 text-xs">
              <div className="p-3 bg-muted/40 border border-border rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The account created here will become the Root Administrator for your organization with full system privileges.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="admin-firstname">First Name</FieldLabel>
                  <Input
                    id="admin-firstname"
                    type="text"
                    required
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    placeholder="Jane"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="admin-lastname">Last Name</FieldLabel>
                  <Input
                    id="admin-lastname"
                    type="text"
                    required
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    placeholder="Smith"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="admin-email">Email Address</FieldLabel>
                <Input
                  id="admin-email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="owner@company.com"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="admin-password">Create Account Password</FieldLabel>
                <Input
                  id="admin-password"
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </Field>

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
              <Field>
                <FieldLabel htmlFor="company-name">Organization Name (Required)</FieldLabel>
                <Input
                  id="company-name"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Apex Hardware Technologies"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="legal-name">Legal Entity Name (Optional)</FieldLabel>
                  <Input
                    id="legal-name"
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Apex Hardware Inc."
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tax-id">GST / Tax ID (Optional)</FieldLabel>
                  <Input
                    id="tax-id"
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="TAX-998877"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="support-phone">Support Phone (Optional)</FieldLabel>
                  <Input
                    id="support-phone"
                    type="text"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="+1 555-0100"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="website">Website (Optional)</FieldLabel>
                  <Input
                    id="website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://apex.hardware"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="address">Operating Address (Optional)</FieldLabel>
                <Input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="400 Innovation Drive"
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <FieldLabel htmlFor="country">Country</FieldLabel>
                  <Input
                    id="country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                  <Input
                    id="timezone"
                    type="text"
                    value={primaryTimezone}
                    onChange={(e) => setPrimaryTimezone(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="currency">Base Currency</FieldLabel>
                  <Select
                    value={baseCurrency}
                    onValueChange={(val) => setBaseCurrency(val ?? 'INR')}
                  >
                    <SelectTrigger id="currency">
                      <SelectValue placeholder="INR" />
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
                      Create Organization &amp; Launch
                    </>
                  )}
                </Button>
              </div>

          </form>
        )}
      </div>
    </div>
  </div>
  )
}

