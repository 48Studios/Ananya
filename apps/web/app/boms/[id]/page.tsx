"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Boxes,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Pencil,
  Trash2,
  History,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { BomForm } from "@/components/boms/bom-form";
import {
  bomsApi,
  type BillOfMaterialsDto,
  type BomStatus,
} from "@/lib/api/boms-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

function getStatusBadge(status: BomStatus) {
  switch (status) {
    case "RELEASED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          RELEASED (ACTIVE)
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          DRAFT
        </span>
      );
    case "OBSOLETE":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          ARCHIVED / OBSOLETE
        </span>
      );
  }
}

export default function ViewBomPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [bom, setBom] = React.useState<BillOfMaterialsDto | null>(null);
  const [productComp, setProductComp] = React.useState<ComponentDto | null>(
    null,
  );
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [revisions, setRevisions] = React.useState<BillOfMaterialsDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isReleasing, setIsReleasing] = React.useState(false);
  const [isObsoleting, setIsObsoleting] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [showReleaseDialog, setShowReleaseDialog] = React.useState(false);
  const [showObsoleteDialog, setShowObsoleteDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const bomData = await bomsApi.getById(id);
      setBom(bomData);

      const [pComp, comps, revs] = await Promise.all([
        componentsApi.getById(bomData.componentId).catch(() => null),
        componentsApi.getAll().catch(() => []),
        bomsApi.getRevisions(bomData.componentId).catch(() => []),
      ]);

      if (pComp) setProductComp(pComp);
      setRevisions(revs);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load Bill of Materials details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRelease = async () => {
    if (!bom) return;
    setIsReleasing(true);
    try {
      const updated = await bomsApi.release(bom.id);
      setBom(updated);
      setShowReleaseDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to publish BOM revision",
      );
    } finally {
      setIsReleasing(false);
    }
  };

  const handleObsolete = async () => {
    if (!bom) return;
    setIsObsoleting(true);
    try {
      const updated = await bomsApi.obsolete(bom.id);
      setBom(updated);
      setShowObsoleteDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to archive BOM revision",
      );
    } finally {
      setIsObsoleting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!bom) return;
    setIsDuplicating(true);
    try {
      const duplicated = await bomsApi.duplicate(bom.id);
      router.push(`/boms/${duplicated.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to duplicate BOM");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (!bom) return;
    setIsDeleting(true);
    try {
      await bomsApi.delete(bom.id);
      router.push("/boms");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete BOM");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading Bill of Materials details..." />;
  }

  if (error || !bom) {
    return (
      <ErrorState
        title="Bill of Materials Not Found"
        message={error || "The requested BOM record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={`${productComp ? productComp.name : "Finished Product"} (${bom.revision})`}
        description={`BOM Specification ID: ${bom.id.slice(0, 8)}`}
        breadcrumbs={[
          { label: "Bill of Materials", href: "/boms" },
          { label: `${productComp?.sku || "Product"} ${bom.revision}` },
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/boms")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDuplicate}
              disabled={isDuplicating}
            >
              <Copy className="w-4 h-4 mr-1.5" />
              Duplicate Revision
            </Button>

            {bom.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
                <Button size="sm" onClick={() => setShowReleaseDialog(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Publish Revision
                </Button>
              </>
            )}

            {bom.status === "RELEASED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowObsoleteDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Archive / Obsolete
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <StatCard
          title="Component Line Items"
          value={`${bom.lines.length} items`}
          subtitle="Required assembly materials"
          icon={Boxes}
        />
        <StatCard
          title="Revision Status"
          value={bom.revision}
          subtitle={`Status: ${bom.status}`}
          icon={Layers}
        />
        <StatCard
          title="Revision History"
          value={`${revisions.length} revisions`}
          subtitle="Historical product versions"
          icon={History}
        />
      </div>

      {/* Edit Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Draft BOM"
        description={`Update draft BOM revision "${bom.revision}" before releasing it for production use.`}
        size="sm"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <BomForm
            initialData={bom}
            onSuccess={(updated) => {
              setBom(updated);
              setIsEditOpen(false);
              fetchData();
            }}
            onCancel={() => setIsEditOpen(false)}
          />
        </div>
      </DialogShell>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata Info */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Assembly Specification
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Master Bill of Materials component tree definition.
              </p>
            </div>
            {getStatusBadge(bom.status)}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Finished Product
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {productComp ? (
                  <Link
                    href={`/components/${productComp.id}`}
                    className="hover:underline flex items-center gap-1"
                  >
                    <Boxes className="w-3.5 h-3.5 text-muted-foreground" />
                    {productComp.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({productComp.sku})
                    </span>
                  </Link>
                ) : (
                  bom.componentId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Revision
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
                {bom.revision}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Released Date
              </dt>
              <dd className="mt-1 text-sm text-foreground font-mono">
                {bom.releasedAt
                  ? new Date(bom.releasedAt).toLocaleString()
                  : "Not published (Draft)"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Lines Count
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {bom.lines.length} items
              </dd>
            </div>
          </dl>

          {bom.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                BOM Specification Notes
              </span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {bom.notes}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Created: {new Date(bom.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(bom.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Revision History Sidebar */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              Revision History
            </h3>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto">
            {revisions.map((rev) => (
              <Link
                key={rev.id}
                href={`/boms/${rev.id}`}
                className={`block p-3 rounded-lg border text-xs transition-colors ${
                  rev.id === bom.id
                    ? "border-primary bg-primary/5 font-semibold"
                    : "border-border bg-muted/20 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-foreground">
                    {rev.revision}
                  </span>
                  {getStatusBadge(rev.status)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground flex justify-between">
                  <span>{rev.lines.length} lines</span>
                  <span>{new Date(rev.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* BOM Line Items Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          BOM Component Tree ({bom.lines.length} Line Items)
        </h3>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Component Item</th>
                <th className="p-3 text-right">Qty / Finished Unit</th>
                <th className="p-3 text-right">Scrap Factor %</th>
                <th className="p-3">Line Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bom.lines.map((line, idx) => {
                const comp = componentsMap[line.componentId];
                return (
                  <tr
                    key={line.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 text-muted-foreground font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-medium">
                      {comp ? (
                        <Link
                          href={`/components/${comp.id}`}
                          className="text-foreground hover:underline"
                        >
                          {comp.name}{" "}
                          <span className="font-mono text-muted-foreground text-[11px]">
                            ({comp.sku})
                          </span>
                        </Link>
                      ) : (
                        <span className="font-mono">{line.componentId}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {line.quantityPerUnit} {line.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {line.scrapFactorPercent > 0
                        ? `${line.scrapFactorPercent}%`
                        : "0%"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {line.notes || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showReleaseDialog}
        title="Publish BOM Revision"
        description={`Are you sure you want to publish BOM revision "${bom.revision}"? Releasing a BOM makes it permanently immutable and active for production Work Orders.`}
        confirmText="Publish Revision"
        loading={isReleasing}
        variant="default"
        onConfirm={handleRelease}
        onCancel={() => setShowReleaseDialog(false)}
      />

      <ConfirmDialog
        isOpen={showObsoleteDialog}
        title="Archive BOM Revision"
        description={`Are you sure you want to archive revision "${bom.revision}"? Archived BOMs remain available for historical reporting.`}
        confirmText="Confirm Archive"
        loading={isObsoleting}
        variant="destructive"
        onConfirm={handleObsolete}
        onCancel={() => setShowObsoleteDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Draft BOM"
        description={`Are you sure you want to permanently delete draft BOM revision "${bom.revision}"?`}
        confirmText="Delete BOM"
        loading={isDeleting}
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
