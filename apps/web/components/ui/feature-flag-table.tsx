"use client";

import * as React from "react";
import { FeatureFlagDto, settingsApi } from "@/lib/api/settings-api";

export interface FeatureFlagTableProps {
  flags: FeatureFlagDto[];
  onFlagToggled?: () => void;
}

export function FeatureFlagTable({
  flags,
  onFlagToggled,
}: FeatureFlagTableProps) {
  const [flagList, setFlagList] = React.useState<FeatureFlagDto[]>(flags);

  React.useEffect(() => {
    setFlagList(flags);
  }, [flags]);

  const handleToggle = async (key: string, isEnabled: boolean) => {
    try {
      await settingsApi.toggleFeatureFlag(key, isEnabled);
      if (onFlagToggled) onFlagToggled();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Environment Feature Toggles
        </h3>
        <p className="text-xs text-muted-foreground">
          Manage experimental, beta, and module feature availability across
          environments.
        </p>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border">
        {flagList.map((flag) => (
          <div
            key={flag.key}
            className="p-4 flex items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  {flag.name}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-muted/40 border border-border text-muted-foreground">
                  {flag.key}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/10 text-primary uppercase">
                  {flag.category}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {flag.description || "Feature flag toggle"}
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={flag.isEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  const next = flagList.map((f) =>
                    f.key === flag.key ? { ...f, isEnabled: val } : f,
                  );
                  setFlagList(next);
                  handleToggle(flag.key, val);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
