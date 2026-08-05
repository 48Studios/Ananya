"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  UserPlus,
  LogIn,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OnboardingLandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-xl bg-card border border-border p-8 rounded-2xl shadow-2xl space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border pb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-extrabold text-xl shadow-lg">
            A
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Welcome to Ananya ERP
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              48 Studios Enterprise Platform
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground">
            Choose your onboarding option
          </h2>
          <p className="text-xs text-muted-foreground">
            Create a brand new enterprise organization or join an existing
            workspace with an invitation.
          </p>
        </div>

        {/* 3 Main Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Create New Organization */}
          <Link
            href="/onboarding/create"
            className="group flex flex-col justify-between p-5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all hover:border-primary/60 cursor-pointer space-y-4"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Create New Organization
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Initialize a new company workspace. You will automatically
                become the Organization Owner with full administrative controls.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-primary pt-2">
              <span>Start Setup Wizard</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Join Existing Organization */}
          <Link
            href="/onboarding/join"
            className="group flex flex-col justify-between p-5 rounded-xl border border-border bg-card hover:bg-muted/40 transition-all hover:border-border/80 cursor-pointer space-y-4"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Join Existing Organization
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Have an invitation token from your administrator? Join an
                established company workspace.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-foreground pt-2">
              <span>Enter Invitation Token</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>

        {/* Existing User Sign In Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Already have an account?</span>
          </div>
          <Link href="/login">
            <Button variant="outline" size="sm">
              <LogIn className="w-3.5 h-3.5 mr-1.5" />
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
