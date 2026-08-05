"use client";

import * as React from "react";
import { settingsApi } from "@/lib/api/settings-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
  Trash2,
  ShieldAlert,
} from "lucide-react";

export function ResetOrganizationDialog() {
  const [confirmText, setConfirmText] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isFormValid =
    confirmText.trim() === "RESET MY ORGANIZATION" &&
    passwordConfirm.length > 0;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await settingsApi.resetOrganizationData({
        confirmText: confirmText.trim(),
        passwordConfirm,
      });
      setSuccessMsg(res.message);
      setConfirmText("");
      setPasswordConfirm("");
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to execute Organization Reset.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-destructive/5 border border-destructive/20 rounded-xl space-y-4">
        <div className="flex items-center gap-2 text-destructive font-semibold text-sm border-b border-destructive/20 pb-3">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <span>Danger Zone — Organization Data Reset</span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Executing Organization Reset permanently purges all operational
          business data while keeping your organization profile, administrator
          accounts, roles, and settings intact.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-1.5 text-destructive">
            <h5 className="font-semibold flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Will Be Permanently Removed:
            </h5>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 font-mono">
              <li>Components, Inventory & Transactions</li>
              <li>Suppliers, Customers & Contacts</li>
              <li>BOMs, Work Orders & Manufacturing Output</li>
              <li>Projects, Tasks, Milestones & Timesheets</li>
              <li>Purchase Orders & Goods Receipts</li>
              <li>Stock Adjustments, Transfers & Cycle Counts</li>
              <li>Assets, Equipment, Service Requests & RMA</li>
            </ul>
          </div>

          <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1.5 text-foreground">
            <h5 className="font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Will Be Preserved (Tenant Survives):
            </h5>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted-foreground font-mono">
              <li>Organization Profile & Setup Status</li>
              <li>Root Administrator Account & User Directory</li>
              <li>User Sessions & Active Invitations</li>
              <li>System Roles & Permission Matrix</li>
              <li>System Defaults, Numbering Series & Flags</li>
              <li>Security Audit Logs & Security History</li>
            </ul>
          </div>
        </div>

        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form
          onSubmit={handleReset}
          className="space-y-4 pt-2 border-t border-destructive/20"
        >
          <Field>
            <FieldLabel className="text-xs font-semibold text-foreground">
              Confirmation Text Verification
            </FieldLabel>
            <FieldDescription className="text-[11px]">
              Type{" "}
              <strong className="font-mono text-destructive select-all">
                RESET MY ORGANIZATION
              </strong>{" "}
              below to confirm.
            </FieldDescription>
            <Input
              type="text"
              placeholder="RESET MY ORGANIZATION"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>

          <Field>
            <FieldLabel className="text-xs font-semibold text-foreground">
              Administrator Password Re-Authentication
            </FieldLabel>
            <FieldDescription className="text-[11px]">
              Re-enter your administrator account password to authorize this
              destructive operation.
            </FieldDescription>
            <div className="relative">
              <Input
                type="password"
                placeholder="Enter account password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="pr-9"
              />
              <Lock className="w-4 h-4 text-muted-foreground absolute right-3 top-2.5 pointer-events-none" />
            </div>
            {passwordConfirm && passwordConfirm.length < 4 && (
              <FieldError>
                Password is required for security verification
              </FieldError>
            )}
          </Field>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={!isFormValid || loading}
              className="gap-1.5 text-xs font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Executing Reset...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset Organization Data
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
