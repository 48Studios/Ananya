"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Building2,
  UserPlus,
  LogOut,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WelcomePage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-lg bg-card border border-border p-8 rounded-2xl shadow-2xl space-y-6">
        <div className="flex items-center gap-4 border-b border-border pb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              Welcome to Ananya ERP
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Signed in as{" "}
              <span className="text-foreground font-semibold">
                {user?.email || "Authenticated User"}
              </span>
            </p>
          </div>
        </div>

        <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
          <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>Organization Membership Required</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your account has been created successfully. To access Ananya ERP,
            you must join an existing organization or be invited by a workspace
            administrator.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Link href="/onboarding/join" className="block">
            <Button className="w-full h-10">
              <UserPlus className="w-4 h-4 mr-2" />
              Enter Invitation Code / Join Workspace
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
          </Link>

          <Button
            variant="outline"
            className="w-full h-10"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2 text-destructive" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
