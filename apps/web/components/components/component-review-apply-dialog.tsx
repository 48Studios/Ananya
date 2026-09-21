"use client";

import * as React from "react";
import { AlertTriangle, Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  APPLY_COPY,
  APPLY_WARNING,
  buildApplyConfirmationRows,
  type ReviewReferenceMaps,
} from "@/lib/component-review-queue";
import type { ComponentReviewFindingDto } from "@/lib/api/component-review-queue-api";

interface ComponentReviewApplyDialogProps {
  isOpen: boolean;
  finding: ComponentReviewFindingDto | null;
  refs?: ReviewReferenceMaps;
  submitting: boolean;
  onConfirm: (decisionNotes: string) => void;
  onCancel: () => void;
}

/**
 * Confirmation for writing a finding's suggestion to a component.
 *
 * The dialog is explicit that this mutates the component, and it shows the
 * exact current and proposed values so the reviewer can verify before
 * committing. It sends only the finding fingerprint and optional notes; the
 * field and value are decided by the backend.
 */
export function ComponentReviewApplyDialog({
  isOpen,
  finding,
  refs = {},
  submitting,
  onConfirm,
  onCancel,
}: ComponentReviewApplyDialogProps) {
  const [decisionNotes, setDecisionNotes] = React.useState("");

  React.useEffect(() => {
    if (isOpen) setDecisionNotes("");
  }, [isOpen, finding?.id]);

  const rows = finding ? buildApplyConfirmationRows(finding, refs) : [];

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !submitting) onCancel();
      }}
      title={APPLY_COPY.label}
      description={APPLY_COPY.description}
      size="sm"
      closeDisabled={submitting}
    >
      <DialogShellBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{APPLY_WARNING}</span>
        </div>

        {rows.length > 0 && (
          <dl className="divide-y divide-border/70 rounded-lg border border-border bg-card">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] sm:gap-3"
              >
                <dt className="text-[11px] font-medium text-muted-foreground">
                  {row.label}
                </dt>
                <dd
                  className={`text-xs break-words ${row.mono ? "font-mono" : ""} ${
                    row.emphasis
                      ? "font-semibold text-emerald-700 dark:text-emerald-400"
                      : "font-medium text-foreground"
                  }`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <Field>
          <FieldLabel htmlFor="apply-decision-notes">
            Decision notes (optional)
          </FieldLabel>
          <Textarea
            id="apply-decision-notes"
            rows={2}
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder="Record why this suggestion is correct."
            className="text-xs"
            disabled={submitting}
          />
          <FieldDescription>
            Stored with the finding and the AI feedback telemetry.
          </FieldDescription>
        </Field>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={submitting}>
          Cancel
        </DialogShellCancelButton>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={submitting || !finding}
          onClick={() => onConfirm(decisionNotes)}
        >
          {submitting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <PencilLine className="size-3" />
          )}
          {APPLY_COPY.label}
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
