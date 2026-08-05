"use client";

import * as React from "react";
import { NumberingSeriesDto, settingsApi } from "@/lib/api/settings-api";
import { Button } from "@/components/ui/button";
import { Hash, Save } from "lucide-react";

export interface NumberingSeriesEditorProps {
  seriesList: NumberingSeriesDto[];
  onSeriesUpdated?: () => void;
}

export function NumberingSeriesEditor({
  seriesList,
  onSeriesUpdated,
}: NumberingSeriesEditorProps) {
  const [editingList, setEditingList] =
    React.useState<NumberingSeriesDto[]>(seriesList);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setEditingList(seriesList);
  }, [seriesList]);

  const handleUpdate = async (item: NumberingSeriesDto) => {
    setLoading(true);
    try {
      await settingsApi.updateNumberingSeries(item);
      if (onSeriesUpdated) onSeriesUpdated();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const formatSampleCode = (item: NumberingSeriesDto) => {
    const year = new Date().getFullYear();
    const seqStr = String(item.nextSequenceNumber).padStart(
      item.zeroPadLength,
      "0",
    );
    return item.dateFormat === "YYYY"
      ? `${item.prefix}${year}-${seqStr}`
      : `${item.prefix}${seqStr}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Document Numbering Series
          </h3>
          <p className="text-xs text-muted-foreground">
            Configure automatic prefix and sequence rules for document codes.
          </p>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border">
        {editingList.map((item, idx) => (
          <div
            key={item.id || idx}
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1 min-w-[160px]">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-primary" />
                {item.entityType}
              </span>
              <div className="text-[11px] text-muted-foreground font-mono">
                Preview:{" "}
                <strong className="text-primary">
                  {formatSampleCode(item)}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="text-[10px] text-muted-foreground block">
                  Prefix
                </label>
                <input
                  type="text"
                  value={item.prefix}
                  onChange={(e) => {
                    const next = [...editingList];
                    next[idx]!.prefix = e.target.value;
                    setEditingList(next);
                  }}
                  className="px-2.5 py-1 text-xs bg-input border border-border rounded text-foreground outline-none w-24"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground block">
                  Next Seq #
                </label>
                <input
                  type="number"
                  value={item.nextSequenceNumber}
                  onChange={(e) => {
                    const next = [...editingList];
                    next[idx]!.nextSequenceNumber = Number(e.target.value);
                    setEditingList(next);
                  }}
                  className="px-2.5 py-1 text-xs bg-input border border-border rounded text-foreground outline-none w-24"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground block">
                  Zero Pad
                </label>
                <input
                  type="number"
                  value={item.zeroPadLength}
                  onChange={(e) => {
                    const next = [...editingList];
                    next[idx]!.zeroPadLength = Number(e.target.value);
                    setEditingList(next);
                  }}
                  className="px-2.5 py-1 text-xs bg-input border border-border rounded text-foreground outline-none w-16"
                />
              </div>

              <div className="pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUpdate(editingList[idx]!)}
                  disabled={loading}
                  className="h-7 text-xs"
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
