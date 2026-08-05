"use client";

import * as React from "react";
import { Trash2, Archive, CheckCircle, Loader2, X } from "lucide-react";
import { importExportApi, BulkActionType } from "@/lib/api/import-export-api";
import { Button } from "@/components/ui/button";

export interface BulkActionToolbarProps {
  entityType: string;
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export function BulkActionToolbar({
  entityType,
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkActionToolbarProps) {
  const [loading, setLoading] = React.useState(false);
  const [activeAction, setActiveAction] = React.useState<BulkActionType | null>(
    null,
  );
  const [msg, setMsg] = React.useState<string | null>(null);

  if (!selectedIds || selectedIds.length === 0) return null;

  const handleBulkExecute = async (action: BulkActionType) => {
    setLoading(true);
    setActiveAction(action);
    setMsg(null);
    try {
      const res = await importExportApi.executeBulkAction({
        entityType,
        action,
        ids: selectedIds,
      });

      setMsg(
        `Batch action '${action}' completed for ${res.affectedCount} ${entityType} records.`,
      );
      setTimeout(() => {
        setMsg(null);
        onClearSelection();
        onActionComplete();
      }, 1200);
    } catch {
      setMsg("Failed to execute bulk operation");
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border border-border shadow-2xl rounded-xl px-4 py-2.5 flex items-center gap-4 text-xs animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-2 pr-3 border-r border-border font-semibold text-foreground">
        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
          {selectedIds.length}
        </span>
        <span>Selected</span>
      </div>

      {msg ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
          {msg}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkExecute("ARCHIVE")}
            disabled={loading}
            className="h-8 text-xs"
          >
            {loading && activeAction === "ARCHIVE" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <Archive className="w-3.5 h-3.5 mr-1" />
            )}
            Archive
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkExecute("UPDATE_STATUS")}
            disabled={loading}
            className="h-8 text-xs"
          >
            {loading && activeAction === "UPDATE_STATUS" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
            )}
            Set Active
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleBulkExecute("DELETE")}
            disabled={loading}
            className="h-8 text-xs"
          >
            {loading && activeAction === "DELETE" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1" />
            )}
            Delete
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={onClearSelection}
        className="p-1 text-muted-foreground hover:text-foreground rounded ml-2"
        title="Deselect all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
