'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api/auth-api'
import { UserCheck, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function UserOnboardingPage() {
  const router = useRouter()
  const [token, setToken] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await authApi.acceptInvitation({ token, password, firstName, lastName })
      router.push('/login')
    } catch {
      setError('Invalid or expired invitation token.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md bg-card border border-border p-6 rounded-xl shadow-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Welcome to Ananya ERP</h2>
            <p className="text-xs text-muted-foreground">Complete your profile to join the workspace</p>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-foreground">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground">Invitation Token</label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste invitation token"
              className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary font-mono text-foreground"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground">Create Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 mt-1 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
            Complete Profile & Join Workspace
          </Button>
        </form>
      </div>
    </div>
  )
}
