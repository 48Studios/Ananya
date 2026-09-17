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
          <div className="flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-primary" />
            <span>Manage Options: {attribute?.name}</span>
          </div>
        }
        description={`Configure predefined selection choices for '${attribute?.code}'. Products can select from these options.`}
        size="md"
      >
        <DialogShellBody className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Add Option Form */}
          <form
            onSubmit={handleAddOption}
            className="p-3.5 bg-muted/40 border border-border rounded-xl space-y-2.5"
          >
            <p className="text-xs font-semibold text-foreground">
              Add New Option
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="sm:col-span-3">
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
                  placeholder="Option Label (e.g. 0805, SMD, Gold Plated)"
                  className="h-8 text-xs"
                  disabled={addingOption}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Code (optional)"
                  className="h-8 text-xs font-mono"
                  disabled={addingOption}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={addingOption || !newLabel.trim()}
                className="h-7 text-xs gap-1"
              >
                {addingOption ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Add Option
              </Button>
            </div>
          </form>

          {/* Options List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Configured Choices ({options.length})</span>
              <span>Sorted by priority</span>
            </div>

            {loading ? (
              <div className="py-8 text-center space-y-2">
                <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground">Loading options...</p>
              </div>
            ) : options.length === 0 ? (
              <div className="py-8 text-center bg-card/40 border border-dashed border-border rounded-xl">
                <Tag className="w-6 h-6 text-muted-foreground/50 mx-auto mb-1" />
                <p className="text-xs font-medium text-foreground">
                  No options defined
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Add choices using the form above.
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-xl divide-y divide-border/60 overflow-hidden">
                {options.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className="flex items-center justify-between p-2.5 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-[10px] font-mono text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {opt.label}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          code: {opt.code}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeletingOption(opt)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton>Close</DialogShellCancelButton>
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
