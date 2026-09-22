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
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  APPLY_COPY,
  APPLY_WARNING,
  ASSIGN_WARNING,
  applyActionCopy,
  applyAssignableEntity,
  applyAssignmentFieldLabel,
  applyAssignmentHint,
  buildApplyConfirmationRows,
  suggestedEntityAssignment,
  type ReviewReferenceMaps,
} from "@/lib/component-review-queue";
import type { ComponentReviewFindingDto } from "@/lib/api/component-review-queue-api";

interface ComponentReviewApplyDialogProps {
  isOpen: boolean;
  finding: ComponentReviewFindingDto | null;
  refs?: ReviewReferenceMaps;
  submitting: boolean;
  /**
   * Confirms the application.
   *
   * `targetEntityId` is sent only when the reviewer assigned a different
   * manufacturer/category than the finding suggested; an unedited acceptance
   * carries no value, exactly as it always has.
   */
  onConfirm: (decisionNotes: string, targetEntityId?: string) => void;
  onCancel: () => void;
  /**
   * Whether the reviewer may create a manufacturer/category that does not exist
   * yet. Mirrors the queue's own write permission; the API stays authoritative.
   */
  canCreate?: boolean;
}

/**
 * Confirmation for writing a finding's suggestion to a component.
 *
 * The dialog is explicit that this mutates the component, and it shows the
 * exact current and proposed values so the reviewer can verify before
 * committing.
 *
 * Manufacturer and category findings additionally allow the reviewer to *edit*
 * the suggestion: the assignment control is the same searchable, creatable
 * dropdown the component form uses for those two fields, so a wrong suggestion
 * can be corrected — or a suggested name the ERP does not hold yet can be
 * created and assigned — before anything is written. Everything else about the
 * application is unchanged: the field is decided by the backend, and the
 * request carries only the finding's fingerprint, optional notes, and the
 * assigned row when there is one.
 */
export function ComponentReviewApplyDialog({
  isOpen,
  finding,
  refs = {},
  submitting,
  onConfirm,
  onCancel,
  canCreate = false,
}: ComponentReviewApplyDialogProps) {
  const [decisionNotes, setDecisionNotes] = React.useState("");
  /**
   * The reviewer's assignment, or `undefined` while the suggestion stands.
   *
   * `undefined` and `null` mean different things: untouched versus deliberately
   * assigned. Deriving the effective value from that distinction avoids
   * prefilling state from a prop (and resynchronising it when the suggestion
   * loads), which is where an assignment control usually goes wrong.
   */
  const [assigned, setAssigned] = React.useState<
    { id: string; label: string | null } | null | undefined
  >(undefined);

  React.useEffect(() => {
    if (isOpen) {
      setDecisionNotes("");
      setAssigned(undefined);
    }
  }, [isOpen, finding?.id]);

  const assignable = finding ? applyAssignableEntity(finding) : null;
  const suggestion = finding ? suggestedEntityAssignment(finding, refs) : null;
  const suggestedId = suggestion?.id ?? null;
  const effectiveId =
    assigned === undefined ? suggestedId : (assigned?.id ?? null);
  // An assignment is an edit unless it names the row the finding already proposed.
  const assignmentEdited = Boolean(effectiveId) && effectiveId !== suggestedId;
  // The label for the row being written: what the reviewer picked, or the
  // finding's own name for it while the suggestion stands. The dropdown reports
  // a label for every selection path (including a record it just created), so
  // the fallback is only ever the untouched case.
  const chosenLabel = assigned?.label ?? suggestion?.label ?? null;
  const assignmentHint = finding ? applyAssignmentHint(finding) : null;

  const copy = finding ? applyActionCopy(finding, assignmentEdited) : APPLY_COPY;
  const warning = assignmentEdited ? ASSIGN_WARNING : APPLY_WARNING;
  const rows = finding
    ? buildApplyConfirmationRows(finding, refs, {
        assignedLabel: assignmentEdited ? chosenLabel : null,
      })
    : [];
  const missingAssignment = assignable !== null && !effectiveId;

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !submitting) onCancel();
      }}
      title={copy.label}
      description={copy.description}
      size="sm"
      closeDisabled={submitting}
    >
      <DialogShellBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{warning}</span>
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

        {/*
          The assignment control. This is the only place in the review queue
          where a reviewer may change what will be written, and it can only
          choose between records the ERP already holds — a new one is created
          through the master-data endpoints the component form already uses, and
          the backend refuses an id that does not exist rather than creating it.
        */}
        {assignable && finding && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              {applyAssignmentFieldLabel(finding)}
            </span>
            <EntitySelector
              id="finding-assignment"
              entity={assignable}
              value={effectiveId}
              onChange={(id, label) =>
                setAssigned(id ? { id, label: label ?? null } : null)
              }
              placeholder={
                assignable === "category"
                  ? "Search or create a category..."
                  : "Search or create a manufacturer..."
              }
              creatable
              canCreate={canCreate}
              clearable={false}
              disabled={submitting}
              aiSuggestion={
                suggestion && suggestion.id
                  ? {
                      label: suggestion.label,
                      resolution: suggestion.resolution,
                      value: suggestion.id,
                    }
                  : null
              }
            />
            {assignmentHint ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {assignmentHint}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Keep the suggestion, or pick the correct record. A record that
                does not exist yet can be created from the list and will be
                assigned when you apply.
              </p>
            )}
          </div>
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
            placeholder={
              assignmentEdited
                ? "Record why the suggested value was replaced."
                : "Record why this suggestion is correct."
            }
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
          disabled={submitting || !finding || missingAssignment}
          title={
            missingAssignment
              ? `Assign an existing ${assignable ?? "record"} before applying.`
              : copy.description
          }
          onClick={() =>
            onConfirm(
              decisionNotes,
              assignmentEdited && effectiveId ? effectiveId : undefined,
            )
          }
        >
          {submitting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <PencilLine className="size-3" />
          )}
          {copy.label}
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
