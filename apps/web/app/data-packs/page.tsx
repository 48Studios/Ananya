"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellCancelButton,
} from "@/components/ui/dialog-shell";
import {
  dataPacksApi,
  type DataPackCatalogDto,
  type DataPackDetailDto,
} from "@/lib/api/data-packs-api";
import {
  Box,
  Database,
  Layers,
  Sliders,
  Download,
  CheckCircle2,
  PackageCheck,
  AlertCircle,
  Search,
  Eye,
  Loader2,
  ArrowRight,
  Tag,
  Scale,
} from "lucide-react";

export default function DataPacksPage() {
  const [packs, setPacks] = React.useState<DataPackCatalogDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [installingId, setInstallingId] = React.useState<string | null>(null);
  const [installedPacks, setInstalledPacks] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL");
  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Manifest inspection dialog state
  const [inspectingPackId, setInspectingPackId] = React.useState<string | null>(
    null,
  );
  const [inspectDetail, setInspectDetail] = React.useState<DataPackDetailDto | null>(
    null,
  );
  const [inspectLoading, setInspectLoading] = React.useState(false);
  const [manifestTab, setManifestTab] = React.useState<
    "attributes" | "categories" | "units" | "rows"
  >("attributes");

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dataPacksApi.getCatalog();
      setPacks(data);
      const serverInstalled = data.filter((p) => p.isInstalled).map((p) => p.id);
      setInstalledPacks((prev) => Array.from(new Set([...serverInstalled, ...prev])));
    } catch {
      setError("Failed to load Data Packs catalog. Please check network connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleInspect = async (packId: string) => {
    setInspectingPackId(packId);
    setInspectLoading(true);
    setInspectDetail(null);
    try {
      const detail = await dataPacksApi.getPackById(packId);
      setInspectDetail(detail);
      if (detail.attributeDefinitions && detail.attributeDefinitions.length > 0) {
        setManifestTab("attributes");
      } else if (detail.rows && detail.rows.length > 0) {
        setManifestTab("rows");
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: `Failed to inspect manifest for pack '${packId}'.`,
      });
      setInspectingPackId(null);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleInstall = async (packId: string, packName: string) => {
    setInstallingId(packId);
    setStatusMessage(null);
    try {
      const res = await dataPacksApi.installPack(packId);
      setInstalledPacks((prev) =>
        prev.includes(packId) ? prev : [...prev, packId],
      );
      setStatusMessage({
        type: "success",
        text: `Successfully installed '${packName}' (${res.processedRecords} records processed).`,
      });
      // Synchronize catalog with backend to guarantee persistence
      const refreshed = await dataPacksApi.getCatalog();
      setPacks(refreshed);
      setInstalledPacks(refreshed.filter((p) => p.isInstalled).map((p) => p.id));
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : `Failed to install data pack '${packName}'.`,
      });
    } finally {
      setInstallingId(null);
    }
  };

  // Filtered packs
  const filteredPacks = React.useMemo(() => {
    return packs.filter((pack) => {
      const matchesCategory =
        selectedCategory === "ALL" || pack.category === selectedCategory;
      const matchesSearch =
        pack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pack.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pack.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [packs, selectedCategory, searchQuery]);

  const totalRecords = React.useMemo(
    () => packs.reduce((acc, p) => acc + (p.recordCount || 0), 0),
    [packs],
  );

  const domainPacksCount = React.useMemo(
    () =>
      packs.filter((p) => p.category === "Domain Specifications" || p.id === "electronics-smd").length,
    [packs],
  );

  const installedCount = React.useMemo(() => {
    return packs.filter((p) => Boolean(p.isInstalled) || installedPacks.includes(p.id)).length;
  }, [packs, installedPacks]);

  const categoriesList = ["ALL", "Domain Specifications", "Core Lookup", "Infrastructure"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Packs & Extensions"
        description="Discover, inspect, and install preconfigured industry domain packages, dynamic attributes, units, and master lookup taxonomies."
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Catalog Data Packs"
          value={packs.length}
          subtitle="Available curated packages"
          icon={Box}
        />
        <StatCard
          title="Installed Packs"
          value={installedCount}
          subtitle="Active in workspace"
          icon={PackageCheck}
        />
        <StatCard
          title="Domain Specifications"
          value={domainPacksCount}
          subtitle="Electronics & industry specs"
          icon={Sliders}
        />
        <StatCard
          title="Catalog Records"
          value={totalRecords}
          subtitle="Units, categories & definitions"
          icon={Database}
        />
      </div>

      {/* Notifications / Alerts */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm font-medium transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          {statusMessage.type === "success" && (
            <div className="flex items-center gap-2">
              <Link href="/attributes">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-7 text-xs gap-1.5 bg-card/60"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Attribute Library <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
              <Link href="/categories">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-7 text-xs gap-1.5 bg-card/60"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Categories <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border overflow-x-auto">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat === "ALL" ? "All Packs" : cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search packs by name or specs..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* Packs Grid */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading Data Packs catalog...</p>
        </div>
      ) : filteredPacks.length === 0 ? (
        <div className="py-16 text-center bg-card/50 border border-dashed border-border rounded-2xl space-y-3">
          <Box className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">No data packs found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No packages match your search filter. Try selecting &quot;All Packs&quot; or clearing your query.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPacks.map((pack) => {
            const isInstalled =
              Boolean(pack.isInstalled) || installedPacks.includes(pack.id);
            const isInstalling = installingId === pack.id;

            return (
              <div
                key={pack.id}
                className="p-5 bg-card border border-border rounded-xl flex flex-col justify-between hover:border-border/80 transition-colors space-y-4"
              >
                <div className="space-y-3">
                  {/* Top Bar: Category Pill on Left, Status Badge on Right */}
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

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {pack.name}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2 min-h-[2.25rem]">
                      {pack.description}
                    </p>
                  </div>

                  {/* Target Entity & Record Count Meta Box */}
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

                {/* Footer Actions */}
                <div className="pt-3 border-t border-border/60 flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleInspect(pack.id)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    Inspect Manifest
                  </Button>

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
      )}

      {/* Inspect Manifest Dialog */}
      <DialogShell
        open={Boolean(inspectingPackId)}
        onOpenChange={(open) => {
          if (!open) {
            setInspectingPackId(null);
            setInspectDetail(null);
          }
        }}
        title={
          inspectDetail ? (
            <div className="flex items-center gap-2">
              <Box className="w-5 h-5 text-primary" />
              <span>{inspectDetail.name}</span>
            </div>
          ) : (
            "Data Pack Manifest"
          )
        }
        description={
          inspectDetail
            ? inspectDetail.description
            : "Detailed specification and entity manifest provided by this Data Pack."
        }
        size="lg"
      >
        <DialogShellBody className="space-y-4">
          {inspectLoading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-7 h-7 text-primary animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">
                Loading pack manifest...
              </p>
            </div>
          ) : !inspectDetail ? (
            <p className="text-xs text-destructive">Failed to load manifest.</p>
          ) : (
            <div className="space-y-4">
              {/* Manifest Tab Navigation */}
              <div className="flex items-center gap-2 border-b border-border pb-2">
                {inspectDetail.attributeDefinitions && (
                  <button
                    onClick={() => setManifestTab("attributes")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      manifestTab === "attributes"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Attribute Definitions ({inspectDetail.attributeDefinitions.length})
                  </button>
                )}
                {inspectDetail.categories && (
                  <button
                    onClick={() => setManifestTab("categories")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      manifestTab === "categories"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    Categories ({inspectDetail.categories.length})
                  </button>
                )}
                {inspectDetail.units && (
                  <button
                    onClick={() => setManifestTab("units")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      manifestTab === "units"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    Physical Units ({inspectDetail.units.length})
                  </button>
                )}
                {inspectDetail.rows && (
                  <button
                    onClick={() => setManifestTab("rows")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      manifestTab === "rows"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    Records ({inspectDetail.rows.length})
                  </button>
                )}
              </div>

              {/* Tab: Attribute Definitions */}
              {manifestTab === "attributes" && inspectDetail.attributeDefinitions && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    These dynamic attributes will be created in your global Attribute Library.
                  </p>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/70 text-muted-foreground font-mono">
                        <tr className="border-b border-border">
                          <th className="p-2.5 font-medium">Attribute</th>
                          <th className="p-2.5 font-medium">Code</th>
                          <th className="p-2.5 font-medium">Data Type</th>
                          <th className="p-2.5 font-medium">Unit / Category</th>
                          <th className="p-2.5 font-medium">Options / Predefined Values</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {inspectDetail.attributeDefinitions.map((attr) => (
                          <tr key={attr.code} className="hover:bg-muted/30">
                            <td className="p-2.5 font-medium text-foreground">
                              {attr.name}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-primary">
                              {attr.code}
                            </td>
                            <td className="p-2.5">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                                {attr.dataType}
                              </span>
                            </td>
                            <td className="p-2.5 text-muted-foreground">
                              {attr.unitCategory || attr.defaultUnit || "—"}
                            </td>
                            <td className="p-2.5">
                              {attr.options && attr.options.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {attr.options.slice(0, 6).map((opt) => (
                                    <span
                                      key={opt.code}
                                      className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-muted/60 text-foreground border border-border/40"
                                    >
                                      {opt.label}
                                    </span>
                                  ))}
                                  {attr.options.length > 6 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{attr.options.length - 6} more
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/60">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab: Categories & Category Mappings */}
              {manifestTab === "categories" && inspectDetail.categories && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Category taxonomy and configured dynamic specifications.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {inspectDetail.categories.map((cat) => {
                      const mappings =
                        (
                          inspectDetail.categoryMappings ||
                          inspectDetail.categoryBindings
                        )?.filter((m) => m.categoryCode === cat.code) || [];

                      return (
                        <div
                          key={cat.code}
                          className="p-3.5 bg-card border border-border rounded-xl space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-foreground">
                              {cat.name}
                            </h4>
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {cat.code}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {cat.description}
                          </p>
                          {mappings.length > 0 && (
                            <div className="pt-2 border-t border-border/50">
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                                Assigned Specifications:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {mappings.map((m) => (
                                  <span
                                    key={m.attributeCode}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                      m.isRequired
                                        ? "bg-primary/10 text-primary font-medium border border-primary/20"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {m.attributeCode}
                                    {m.isRequired ? " *" : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab: Physical Units */}
              {manifestTab === "units" && inspectDetail.units && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Physical units of measure installed into the unit conversion registry.
                  </p>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/70 text-muted-foreground font-mono">
                        <tr className="border-b border-border">
                          <th className="p-2.5 font-medium">Unit Symbol</th>
                          <th className="p-2.5 font-medium">Category</th>
                          <th className="p-2.5 font-medium">Base Unit?</th>
                          <th className="p-2.5 font-medium">Conversion Factor</th>
                          <th className="p-2.5 font-medium">Precision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {inspectDetail.units.map((u) => (
                          <tr key={u.name} className="hover:bg-muted/30">
                            <td className="p-2.5 font-bold font-mono text-foreground">
                              {u.name}
                            </td>
                            <td className="p-2.5 text-muted-foreground">
                              {u.category}
                            </td>
                            <td className="p-2.5">
                              {u.isBaseUnit ? (
                                <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-medium">
                                  Base
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">—</span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">
                              {u.conversionFactor}
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">
                              {u.precision}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab: Generic Rows */}
              {manifestTab === "rows" && inspectDetail.rows && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Sample preview of records imported into{" "}
                    <strong>{inspectDetail.entityType}</strong>.
                  </p>
                  <div className="border border-border rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/70 text-muted-foreground font-mono">
                        <tr className="border-b border-border">
                          {Object.keys(inspectDetail.rows[0] || {}).map((col) => (
                            <th key={col} className="p-2.5 font-medium">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {inspectDetail.rows.slice(0, 10).map((row, idx) => (
                          <tr key={idx} className="hover:bg-muted/30">
                            {Object.values(row).map((val, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="p-2.5 font-mono text-[11px] text-foreground"
                              >
                                {String(val ?? "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogShellBody>
        <DialogShellFooter>
          <DialogShellCancelButton>Close</DialogShellCancelButton>
          {inspectDetail && (
            <Button
              size="sm"
              onClick={() => {
                const id = inspectDetail.id;
                const name = inspectDetail.name;
                setInspectingPackId(null);
                handleInstall(id, name);
              }}
              disabled={installingId === inspectDetail.id}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Install This Pack
            </Button>
          )}
        </DialogShellFooter>
      </DialogShell>
    </div>
  );
}
