'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { ShieldCheck, Eye, EyeOff, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [rememberMe, setRememberMe] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch {
      setError('Invalid credentials or account deactivated.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background text-foreground font-sans">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-muted/20 border-r border-border relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-lg">
            A
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">Ananya ERP</h1>
            <p className="text-xs text-muted-foreground font-mono">48 Studios Enterprise Operations</p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Identity & Access Control</span>
          </div>
          <h2 className="text-3xl font-extrabold text-foreground tracking-tight leading-tight">
            Centralized Platform for Modern Hardware & Film Production.
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage components, inventory transactions, manufacturing work orders, and supply chain logistics with precision.
          </p>
        </div>

        <div className="text-xs text-muted-foreground font-mono flex items-center justify-between border-t border-border pt-4">
          <span>© 2026 48 Studios. All rights reserved.</span>
          <span>v1.0.0-RC1</span>
        </div>
      </div>

      {/* Right Login Form */}
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">Sign in to your workspace</h2>
            <p className="text-xs text-muted-foreground">Enter your enterprise credentials to access Ananya ERP</p>
          </div>

          {error && (
            <div className="p-3 text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@48studios.com"
                  className="w-full pl-9 pr-3 py-2 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground">Password</label>
                <Link href="/forgot-password" className="text-[11px] text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2 bg-input border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground font-medium">Remember this browser</span>
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Sign In
            </Button>
          </form>

          <div className="text-center pt-4 border-t border-border text-xs text-muted-foreground">
            First launch?{' '}
            <Link href="/setup" className="text-primary font-semibold hover:underline">
              Run Organization Setup Wizard →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
