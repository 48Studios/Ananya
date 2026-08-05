'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { ShieldCheck, Eye, EyeOff, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'


function LoginFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const isExpired = searchParams?.get('expired') === 'true'

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [rememberMe, setRememberMe] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    isExpired ? 'Your session has expired. Please sign in again.' : null,
  )

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

        <div className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} 48 Studios. All rights reserved. Version 1.0.0-RC1
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in to your workspace</h2>
            <p className="text-sm text-muted-foreground">
              Enter your enterprise credentials to access Ananya ERP.
            </p>
          </div>

          {error && (
            <div className="p-3 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field>
              <FieldLabel htmlFor="login-email">Email Address</FieldLabel>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 z-10" />
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@48studios.com"
                  className="pl-9 h-10 text-sm"
                />
              </div>
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 z-10" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="pl-9 pr-10 h-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground z-10"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Field orientation="horizontal" className="w-auto items-center">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
              />
              <FieldLabel htmlFor="remember-me" className="cursor-pointer text-xs font-normal text-muted-foreground">
                Remember me for 30 days
              </FieldLabel>
            </Field>

            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <div className="text-center text-xs text-muted-foreground">
            Need access to Ananya ERP?{' '}
            <Link href="/onboarding" className="text-primary font-medium hover:underline">
              Request workspace invitation
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginFormContent />
    </React.Suspense>
  )
}
