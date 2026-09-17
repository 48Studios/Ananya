"use client";

import * as React from "react";
import Link from "next/link";
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
  Sliders,
  ArrowRight,
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
      const serverInstalled = data.filter((p) => p.isInstalled).map((p) => p.id);
      setInstalledPacks((prev) => Array.from(new Set([...serverInstalled, ...prev])));
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
      const refreshed = await dataPacksApi.getCatalog();
      setPacks(refreshed);
      setInstalledPacks(refreshed.filter((p) => p.isInstalled).map((p) => p.id));
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
        <Link href="/data-packs">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            Open Full Hub <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      {msg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{msg}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/categories">
              <Button variant="outline" size="xs" className="h-6 text-[11px] gap-1">
                Categories <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
            <Link href="/components">
              <Button variant="outline" size="xs" className="h-6 text-[11px] gap-1">
                Components <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packs.map((pack) => {
          const isInstalled = Boolean(pack.isInstalled) || installedPacks.includes(pack.id);
          const isInstalling = installingId === pack.id;

          return (
            <div
              key={pack.id}
              className="p-5 bg-card border border-border rounded-xl flex flex-col justify-between hover:border-border/80 transition-colors space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                    {pack.category === "Core Lookup" ? (
                      <Database className="w-3.5 h-3.5 text-blue-500" />
                    ) : pack.category === "Infrastructure" ? (
                      <Layers className="w-3.5 h-3.5 text-amber-500" />
                    ) : pack.category === "Domain Specifications" ? (
                      <Sliders className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Box className="w-3.5 h-3.5 text-purple-500" />
                    )}
                    {pack.category}
                  </span>

                  {isInstalled ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Installed
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-muted/60 text-muted-foreground border border-border/60">
                      Available
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {pack.name}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2 min-h-[2.25rem]">
                    {pack.description}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs bg-muted/20 border border-border/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span>Target:</span>
                    <strong className="text-foreground font-semibold">
                      {pack.entityType}
                    </strong>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {pack.recordCount}
                    </strong>{" "}
                    records
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center justify-end gap-2">
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
                      Re-Install
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Install Pack
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
