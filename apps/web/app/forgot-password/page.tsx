'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('')
  const [submitted, setSubmitted] = React.useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-sm bg-card border border-border p-6 rounded-xl shadow-2xl space-y-5">
        <div className="space-y-1 text-center">
          <h2 className="text-lg font-bold text-foreground">Reset Password</h2>
          <p className="text-xs text-muted-foreground">Enter your email to receive password recovery instructions</p>
        </div>

        {submitted ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs space-y-2 text-center">
            <CheckCircle2 className="w-6 h-6 mx-auto" />
            <p className="font-semibold">Recovery Email Sent</p>
            <p className="text-[11px] text-muted-foreground">Check your inbox for instructions to reset your password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <Field>
              <FieldLabel htmlFor="forgot-email">Email Address</FieldLabel>
              <Input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@48studios.com"
              />
            </Field>

            <Button type="submit" className="w-full">
              Send Reset Link
            </Button>
          </form>
        )}

        <div className="text-center pt-2">
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

