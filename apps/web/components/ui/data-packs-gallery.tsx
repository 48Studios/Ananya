"use client";

import * as React from "react";
import { dataPacksApi, DataPackCatalogDto } from "@/lib/api/data-packs-api";
import { Button } from "@/components/ui/button";
import {
  Box,
  CheckCircle2,
  Download,
  Database,
  Layers,
  Loader2,
  PackageCheck,
} from "lucide-react";

export function DataPacksGallery() {
  const [packs, setPacks] = React.useState<DataPackCatalogDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [installingId, setInstallingId] = React.useState<string | null>(null);
  const [installedPacks, setInstalledPacks] = React.useState<string[]>([]);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await dataPacksApi.getCatalog();
      setPacks(data);
    } catch {
      setErrorMsg("Failed to load Data Packs catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleInstall = async (id: string, name: string) => {
    setInstallingId(id);
    setMsg(null);
    setErrorMsg(null);
    try {
      const res = await dataPacksApi.installPack(id);
      setInstalledPacks((prev) => [...prev, id]);
      setMsg(
        `Successfully installed '${name}' (${res.processedRecords} records imported).`,
      );
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to install Data Pack.",
      );
    } finally {
      setInstallingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center space-y-2">
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
        <p className="text-xs text-muted-foreground">
          Loading Data Packs catalog...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Box className="w-4 h-4 text-primary" />
            Administrator Data Packs
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Install curated data packages (Base Units, Default Categories, Core
            Logistics, Demo Datasets) directly through the production Import
            Engine.
          </p>
        </div>
      </div>

      {msg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packs.map((pack) => {
          const isInstalled = installedPacks.includes(pack.id);
          const isInstalling = installingId === pack.id;

          return (
            <div
              key={pack.id}
              className="p-5 bg-card border border-border rounded-xl space-y-3 hover:border-primary/50 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                    {pack.category === "Core Lookup" ? (
                      <Database className="w-3 h-3 text-blue-500" />
                    ) : pack.category === "Infrastructure" ? (
                      <Layers className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Box className="w-3 h-3 text-emerald-500" />
                    )}
                    {pack.category}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {pack.recordCount} Records
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-foreground">
                  {pack.name}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {pack.description}
                </p>
              </div>

              <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-mono">
                  Target Entity:{" "}
                  <strong className="text-foreground">{pack.entityType}</strong>
                </span>

                <Button
                  size="sm"
                  variant={isInstalled ? "outline" : "default"}
                  onClick={() => handleInstall(pack.id, pack.name)}
                  disabled={isInstalling}
                  className="h-8 text-xs gap-1.5"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Installing...
                    </>
                  ) : isInstalled ? (
                    <>
                      <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />
                      Re-Install Pack
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Install Data Pack
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
