'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authApi, type UserInvitationDto } from '@/lib/api/auth-api'
import { UserCheck, ArrowLeft, Loader2, CheckCircle2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'


function JoinOrganizationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialToken = searchParams?.get('token') || ''

  const [token, setToken] = React.useState(initialToken)
  const [invitation, setInvitation] = React.useState<UserInvitationDto | null>(null)
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [password, setPassword] = React.useState('')

  const [validating, setValidating] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleVerifyToken = React.useCallback(async () => {
    if (!token.trim()) return
    setValidating(true)
    setError(null)
    try {
      const res = await authApi.verifyInvitation(token.trim())
      setInvitation(res)
    } catch {
      setError('Invalid, revoked, or expired invitation token.')
      setInvitation(null)
    } finally {
      setValidating(false)
    }
  }, [token])

  React.useEffect(() => {
    if (initialToken) {
      handleVerifyToken()
    }
  }, [initialToken, handleVerifyToken])

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await authApi.acceptInvitation({
        token: token.trim(),
        password,
        firstName,
        lastName,
      })
      if (res.token) {
        localStorage.setItem('ananya_auth_token', res.token)
        document.cookie = `ananya_auth_token=${res.token}; path=/; max-age=604800; SameSite=Lax`
      }
      router.push('/dashboard')
    } catch {
      setError('Failed to accept invitation. The link may have expired.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Join Existing Organization</h2>
            <p className="text-xs text-muted-foreground">Accept your invitation to join workspace</p>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
            {error}
          </div>
        )}

        {invitation ? (
          <form onSubmit={handleAcceptInvitation} className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <Building2 className="w-4 h-4" />
                <span>Verified Workspace Invitation</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Invited Email: <span className="font-mono text-foreground font-semibold">{invitation.email}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="join-firstname">First Name</FieldLabel>
                <Input
                  id="join-firstname"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="join-lastname">Last Name</FieldLabel>
                <Input
                  id="join-lastname"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="join-password">Create Password</FieldLabel>
              <Input
                id="join-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </Field>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setInvitation(null)}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Change Token
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Accept & Join Workspace
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-xs">
            <Field>
              <FieldLabel htmlFor="invite-token">Invitation Token</FieldLabel>
              <Input
                id="invite-token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste invitation token here"
                className="font-mono"
              />
            </Field>

            <Button
              className="w-full h-9"
              onClick={handleVerifyToken}
              disabled={validating || !token.trim()}
            >
              {validating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Verifying Token...
                </>
              ) : (
                'Verify Invitation Token'
              )}
            </Button>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Link href="/onboarding">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Back
                </Button>
              </Link>
              <Link href="/onboarding/create" className="text-xs text-primary font-medium hover:underline">
                Need to create a new organization?
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function JoinOrganizationPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-background" />}>
      <JoinOrganizationContent />
    </React.Suspense>
  )
}
