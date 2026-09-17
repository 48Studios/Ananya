"use client";

import * as React from "react";
import { settingsApi } from "@/lib/api/settings-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellCancelButton,
} from "@/components/ui/dialog-shell";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
  Trash2,
  ShieldAlert,
} from "lucide-react";

export function ResetOrganizationDialog() {
  const [open, setOpen] = React.useState(false);
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
      setOpen(false);
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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && loading) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmText("");
      setPasswordConfirm("");
      setErrorMsg(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Danger Zone</h3>
        <p className="text-xs text-muted-foreground">
          Destructive actions and irreversible operations for this organization.
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Danger Zone Action Card */}
      <div className="border border-destructive/20 rounded-xl bg-card overflow-hidden">
        {/* Main Action Row */}
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 uppercase tracking-wider text-[10px]">
                High Impact
              </span>
              <h4 className="text-sm font-semibold text-foreground">
                Reset Organization Operational Data
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Permanently purge all operational business data (components, inventory ledger transactions, BOMs, orders, and contacts) while retaining your organization profile, administrator accounts, roles, and system configuration.
            </p>
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
            className="gap-2 shrink-0 self-start md:self-center font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset Organization Data...
          </Button>
        </div>

        {/* Impact Scope Details Grid */}
        <div className="border-t border-border bg-muted/20 px-6 py-5">
          <div className="text-[11px] font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Impact Scope &amp; Retention Guarantee
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-background border border-border space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Removed</span>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  <span>Components, inventory stock &amp; ledger transactions</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  <span>Suppliers, customers &amp; address contacts</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  <span>BOMs, work orders &amp; manufacturing logs</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  <span>Projects, milestones, tasks &amp; timesheets</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  <span>Purchase orders, goods receipts &amp; adjustments</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  <span>Assets, equipment, service requests &amp; RMA</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-background border border-border space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Preserved (Tenant Survives)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Organization profile &amp; setup status</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Root administrator credentials &amp; user directory</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Active user sessions &amp; team invitations</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>System roles &amp; RBAC permission matrix</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>System defaults, numbering series &amp; feature flags</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Security audit logs &amp; security history</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation DialogShell */}
      <DialogShell
        open={open}
        onOpenChange={handleOpenChange}
        size="md"
        title={
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="w-4 h-4" />
            <span>Confirm Organization Reset</span>
          </div>
        }
        description="This action is irreversible. All selected operational business data will be permanently wiped."
        closeDisabled={loading}
      >
        <form onSubmit={handleReset}>
          <DialogShellBody className="space-y-4">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Warning: This action cannot be undone
              </div>
              <p className="text-[11px] leading-relaxed text-destructive/90">
                Executing this reset will immediately purge all inventory, purchase orders, BOMs, and manufacturing records. Ensure you have exported any needed data before proceeding.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs font-medium text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Confirmation Phrase
              </FieldLabel>
              <FieldDescription className="text-xs">
                To proceed, type{" "}
                <span className="font-mono font-bold text-destructive select-all px-1 py-0.5 rounded bg-destructive/10 border border-destructive/20">
                  RESET MY ORGANIZATION
                </span>{" "}
                in the box below.
              </FieldDescription>
              <Input
                type="text"
                placeholder="RESET MY ORGANIZATION"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="font-mono text-xs"
                disabled={loading}
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Administrator Password
              </FieldLabel>
              <FieldDescription className="text-xs">
                Enter your administrator account password to verify your identity.
              </FieldDescription>
              <div className="relative">
                <Input
                  type="password"
                  placeholder="Enter administrator password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="pr-9 text-xs"
                  disabled={loading}
                />
                <Lock className="w-4 h-4 text-muted-foreground absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </Field>
          </DialogShellBody>

          <DialogShellFooter>
            <DialogShellCancelButton disabled={loading}>
              Cancel
            </DialogShellCancelButton>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={!isFormValid || loading}
              className="gap-1.5 font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Executing Reset...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Permanently Reset Organization
                </>
              )}
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>
    </div>
  );
}
