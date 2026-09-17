"use client";

import * as React from "react";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type AttributeOptionDto,
} from "@/lib/api/attributes-api";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ListOrdered,
  Tag,
  Hash,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface AttributeOptionsDialogProps {
  isOpen: boolean;
  attribute: AttributeDefinitionDto | null;
  onClose: () => void;
  onOptionsUpdated?: () => void;
}

export function AttributeOptionsDialog({
  isOpen,
  attribute,
  onClose,
  onOptionsUpdated,
}: AttributeOptionsDialogProps) {
  const [options, setOptions] = React.useState<AttributeOptionDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newCode, setNewCode] = React.useState("");
  const [addingOption, setAddingOption] = React.useState(false);
  const [deletingOption, setDeletingOption] =
    React.useState<AttributeOptionDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const fetchOptions = React.useCallback(async () => {
    if (!attribute) return;
    setLoading(true);
    setError(null);
    try {
      const refreshed = await attributesApi.getById(attribute.id);
      setOptions(refreshed.options || []);
    } catch {
      setError("Failed to fetch current attribute options.");
    } finally {
      setLoading(false);
    }
  }, [attribute]);

  React.useEffect(() => {
    if (isOpen && attribute) {
      setOptions(attribute.options || []);
      fetchOptions();
      setNewLabel("");
      setNewCode("");
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, attribute, fetchOptions]);

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attribute || !newLabel.trim()) return;

    const label = newLabel.trim();
    const code = (newCode.trim() || label)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");

    setAddingOption(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await attributesApi.addOption(attribute.id, {
        code,
        label,
        sortOrder: options.length,
      });
      setNewLabel("");
      setNewCode("");
      setSuccessMsg(`Added option "${label}".`);
      await fetchOptions();
      onOptionsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to add attribute option.",
      );
    } finally {
      setAddingOption(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingOption) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await attributesApi.deleteOption(deletingOption.id);
      setSuccessMsg(`Removed option "${deletingOption.label}".`);
      setDeletingOption(null);
      await fetchOptions();
      onOptionsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove option. It may be referenced by existing products.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={
          attribute
            ? `Manage Options: ${attribute.name}`
            : "Manage Options"
        }
        description={
          attribute
            ? `Configure predefined selection choices for "${attribute.name}" (${attribute.code}). Products can select from these options.`
            : "Configure predefined selection choices."
        }
        size="md"
      >
        <DialogShellBody className="space-y-4">
          {/* Notifications */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Add New Option Card */}
          <div className="p-4 bg-card border border-border rounded-xl space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-primary" />
                Add New Option
              </h4>
              {options.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {options.length} configured
                </span>
              )}
            </div>

            <form onSubmit={handleAddOption} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Option Label */}
                <div className="sm:col-span-8">
                  <Field>
                    <FieldLabel className="text-[11px] font-medium">
                      Option Label <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value);
                        if (!newCode || newCode === newLabel.toLowerCase()) {
                          setNewCode(
                            e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                          );
                        }
                      }}
                      placeholder="e.g. 0805, SMD, Gold Plated"
                      className="h-9 text-xs"
                      disabled={addingOption}
                    />
                  </Field>
                </div>

                {/* Option Code */}
                <div className="sm:col-span-4">
                  <Field>
                    <FieldLabel className="text-[11px] font-medium">
                      Code
                    </FieldLabel>
                    <Input
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="Auto-generated"
                      className="h-9 text-xs font-mono"
                      disabled={addingOption}
                    />
                  </Field>
                </div>
              </div>

              {/* Submit Row */}
              <div className="flex justify-end pt-3 border-t border-border/40">
                <Button
                  type="submit"
                  size="sm"
                  disabled={addingOption || !newLabel.trim()}
                  className="gap-1.5 shrink-0 h-8 text-xs font-medium px-4"
                >
                  {addingOption ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Add Option
                </Button>
              </div>
            </form>
          </div>

          {/* Options List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-medium text-foreground">
                Configured Choices ({options.length})
              </span>
              <span className="text-[11px]">Sorted by priority</span>
            </div>

            {loading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading options...
              </div>
            ) : options.length > 0 ? (
              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card shadow-2xs">
                {/* Column Headers */}
                <div className="hidden sm:grid sm:grid-cols-12 px-3.5 py-2 text-[11px] font-medium text-muted-foreground bg-muted/40 border-b border-border">
                  <div className="col-span-1">#</div>
                  <div className="col-span-5">Label</div>
                  <div className="col-span-4">Code</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {options.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className="p-3.5 flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-2 hover:bg-muted/30 transition-colors"
                  >
                    {/* Index (1 col) */}
                    <div className="sm:col-span-1">
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-0.5">
                        <Hash className="w-3 h-3 text-muted-foreground/60 sm:hidden" />
                        {idx + 1}
                      </span>
                    </div>

                    {/* Label (5 cols) */}
                    <div className="sm:col-span-5">
                      <span className="text-xs font-medium text-foreground">
                        {opt.label}
                      </span>
                    </div>

                    {/* Code (4 cols) */}
                    <div className="sm:col-span-4">
                      <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                        {opt.code}
                      </span>
                    </div>

                    {/* Actions (2 cols) */}
                    <div className="sm:col-span-2 flex items-center sm:justify-end gap-1 self-end sm:self-auto">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeletingOption(opt)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Remove Option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center border border-dashed border-border rounded-xl bg-muted/5">
                <Tag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">
                  No options defined
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-sm mx-auto">
                  Add predefined choices using the form above. Products will select from these options.
                </p>
              </div>
            )}
          </div>
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton onClick={onClose}>
            Done
          </DialogShellCancelButton>
        </DialogShellFooter>
      </DialogShell>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingOption)}
        title="Remove Option"
        description={`Are you sure you want to remove "${deletingOption?.label}"? This option will no longer be available for assignment.`}
        confirmText="Remove Option"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingOption(null)}
      />
    </>
  );
}
