"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface LayoutSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isNew: boolean;
  defaultCode?: string;
  defaultName?: string;
  defaultDescription?: string;
  isSaving: boolean;
  onSave: (data: {
    code: string;
    name: string;
    description: string;
    changeDescription?: string;
  }) => Promise<void>;
}

export function LayoutSaveDialog({
  isOpen,
  onClose,
  isNew,
  defaultCode = "",
  defaultName = "",
  defaultDescription = "",
  isSaving,
  onSave,
}: LayoutSaveDialogProps) {
  const [code, setCode] = React.useState(defaultCode);
  const [name, setName] = React.useState(defaultName);
  const [description, setDescription] = React.useState(defaultDescription);
  const [changeDescription, setChangeDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setCode(defaultCode);
      setName(defaultName);
      setDescription(defaultDescription);
      setChangeDescription("");
      setError(null);
    }
  }, [isOpen, defaultCode, defaultName, defaultDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Layout name is required.");
      return;
    }
    if (isNew && !code.trim()) {
      setError("Layout code is required.");
      return;
    }

    try {
      setError(null);
      await onSave({
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        changeDescription: changeDescription.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save layout.");
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onClose();
        }
      }}
      title={isNew ? "Save New Layout Draft" : "Update Layout Draft"}
      description={
        isNew
          ? "Create a new persisted layout draft for this physical storage container."
          : "Save changes to this layout. An immutable revision snapshot will be appended."
      }
      size="md"
      closeDisabled={isSaving}
    >
      <form onSubmit={handleSubmit}>
        <DialogShellBody className="space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
              {error}
            </div>
          )}

          {isNew && (
            <Field>
              <FieldLabel htmlFor="layout-code">Layout Code *</FieldLabel>
              <Input
                id="layout-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CAB-01-LAYOUT"
                disabled={isSaving}
                className="font-mono uppercase text-xs h-9"
                required
              />
              <FieldDescription>
                Unique alphanumeric identifier across all spatial layouts.
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="layout-name">Layout Name *</FieldLabel>
            <Input
              id="layout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SMD Production Cabinet A"
              disabled={isSaving}
              className="text-xs h-9"
              required
            />
            <FieldDescription>
              Human-readable title displayed in the storage inventory explorer.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="layout-description">Description</FieldLabel>
            <Textarea
              id="layout-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes regarding the purpose or physical setup..."
              disabled={isSaving}
              rows={2}
              className="text-xs"
            />
          </Field>

          {!isNew && (
            <Field>
              <FieldLabel htmlFor="change-description">
                Revision Change Note
              </FieldLabel>
              <Input
                id="change-description"
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
                placeholder="e.g. Added 5 additional component slots"
                disabled={isSaving}
                className="text-xs h-9"
              />
              <FieldDescription>
                Optional note explaining this revision in the layout history.
              </FieldDescription>
            </Field>
          )}
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton disabled={isSaving}>
            Cancel
          </DialogShellCancelButton>
          <Button type="submit" disabled={isSaving} size="sm">
            {isSaving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {isNew ? "Create Draft" : "Save Changes"}
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
