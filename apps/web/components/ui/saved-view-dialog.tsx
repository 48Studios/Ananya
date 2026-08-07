"use client";

import * as React from "react";
import { preferencesApi } from "@/lib/api/preferences-api";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";

export interface SavedViewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  module: string;
  currentFilters?: Record<string, unknown>;
  onViewSaved?: () => void;
}

export function SavedViewDialog({
  isOpen,
  onClose,
  module,
  currentFilters = {},
  onViewSaved,
}: SavedViewDialogProps) {
  const [name, setName] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await preferencesApi.createSavedView({
        module,
        name,
        filtersJson: currentFilters,
        isDefault,
      });
      if (onViewSaved) onViewSaved();
      onClose();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) {
          onClose();
        }
      }}
      title="Save Custom View Preset"
      description={`Save active filter configuration as a reusable preset for ${module}.`}
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : null}
            Save View Preset
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-foreground">
            View Preset Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Critical Low Stock (Chennai Warehouse)"
            className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md text-xs outline-none text-foreground focus:ring-1 focus:ring-primary"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded text-primary focus:ring-primary"
          />
          <span>Set as default view for {module}</span>
        </label>
      </div>
    </DialogShell>
  );
}

