"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Factory,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import {
  mrpApi,
  type MrpRequirementDto,
  type MrpRunRecordDto,
  type PlannedProductionOrderDto,
  type PlannedPurchaseOrderDto,
} from "@/lib/api/mrp-api";
import {
  planningMessagesApi,
  type PlanningMessageDto,
} from "@/lib/api/planning-messages-api";
import {
  formatRunCompletedAt,
  formatRunCreatedAt,
  formatRunHorizon,
  formatRunStatus,
  normalizePlanningMessages,
} from "@/lib/mrp-runs";
import { formatDate } from "@/lib/utils";

type Loadable<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

function failureMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function severityClassName(severity: string): string {
  if (severity === "ERROR") {
    return "bg-destructive/10 text-destructive border-destructive/20";
  }
  if (severity === "WARNING") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  }
  return "bg-muted text-muted-foreground border-border";
}

export default function MrpRunDetailPage() {
  const params = useParams();
  const runId = params?.id as string;

  const [run, setRun] = React.useState<Loadable<MrpRunRecordDto>>({
    status: "loading",
  });
  const [messages, setMessages] = React.useState<
    Loadable<PlanningMessageDto[]>
  >({ status: "loading" });
  const [requirements, setRequirements] = React.useState<
    Loadable<MrpRequirementDto[]>
  >({ status: "loading" });
  const [purchases, setPurchases] = React.useState<
    Loadable<PlannedPurchaseOrderDto[]>
  >({ status: "loading" });
  const [production, setProduction] = React.useState<
    Loadable<PlannedProductionOrderDto[]>
  >({ status: "loading" });

  const loadRun = React.useCallback(async () => {
    if (!runId) return;

    setRun({ status: "loading" });
    setMessages({ status: "loading" });
    setRequirements({ status: "loading" });
    setPurchases({ status: "loading" });
    setProduction({ status: "loading" });

    let runData: MrpRunRecordDto;
    try {
      runData = await mrpApi.getRunById(runId);
    } catch (err: unknown) {
      setRun({
        status: "error",
        message: failureMessage(err, "Failed to load the MRP run."),
      });
      return;
    }
    setRun({ status: "ready", data: runData });

    const [messageResult, requirementResult, purchaseResult, productionResult] =
      await Promise.allSettled([
        planningMessagesApi.getAll(runId),
        mrpApi.getGrossRequirements(runId),
        mrpApi.getPurchaseRecommendations(runId),
        mrpApi.getProductionRecommendations(runId),
      ]);

    setMessages(
      messageResult.status === "fulfilled"
        ? { status: "ready", data: messageResult.value }
        : {
            status: "error",
            message: failureMessage(
              messageResult.reason,
              "Failed to load planning messages.",
            ),
          },
    );
    setRequirements(
      requirementResult.status === "fulfilled"
        ? { status: "ready", data: requirementResult.value }
        : {
            status: "error",
            message: failureMessage(
              requirementResult.reason,
              "Failed to load the gross demand matrix.",
            ),
          },
    );
    setPurchases(
      purchaseResult.status === "fulfilled"
        ? { status: "ready", data: purchaseResult.value }
        : {
            status: "error",
            message: failureMessage(
              purchaseResult.reason,
              "Failed to load purchase recommendations.",
            ),
          },
    );
    setProduction(
      productionResult.status === "fulfilled"
        ? { status: "ready", data: productionResult.value }
        : {
            status: "error",
            message: failureMessage(
              productionResult.reason,
              "Failed to load production recommendations.",
            ),
          },
    );
  }, [runId]);

  React.useEffect(() => {
    void loadRun();
  }, [loadRun]);

  if (run.status === "loading") {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading MRP execution log details...
        </p>
      </div>
    );
  }

  if (run.status === "error") {
    return (
      <div className="space-y-6">
        <PageHeader
          backHref="/manufacturing/mrp/runs"
          backLabel="Back to MRP Runs"
          title="MRP Execution Run"
          description="Execution log, gross demand processing matrix, and generated purchase/production recommendations."
        />
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-destructive">
              Could not load this MRP run
            </p>
            <p className="text-xs text-destructive/90">{run.message}</p>
            <Button size="sm" variant="outline" onClick={() => void loadRun()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const runRecord = run.data;
  const messageRows = normalizePlanningMessages(
    messages.status === "ready" ? messages.data : [],
  );
  const requirementRows =
    requirements.status === "ready" ? requirements.data : [];
  const purchaseRows = purchases.status === "ready" ? purchases.data : [];
  const productionRows = production.status === "ready" ? production.data : [];

  const resultsLoaded =
    requirements.status === "ready" &&
    purchases.status === "ready" &&
    production.status === "ready";
  const hasResults =
    requirementRows.length > 0 ||
    purchaseRows.length > 0 ||
    productionRows.length > 0;

  const sectionNotice = (state: Loadable<unknown>, label: string) =>
    state.status === "error" ? (
      <div className="flex items-center gap-2 p-3 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
        <AlertTriangle className="w-3.5 h-3.5" />
        {label}: {state.message}
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/manufacturing/mrp/runs"
        backLabel="Back to MRP Runs"
        title={`MRP Execution Run #${runRecord.runNumber || runId || "MRP-RUN"}`}
        description="Detailed calculation log, gross demand processing matrix, and generated purchase/production recommendations."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Executed By</p>
          <p className="text-sm font-semibold text-foreground">
            {runRecord.startedBy || "—"}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Execution Status</p>
          <p className="text-sm font-semibold text-foreground">
            {formatRunStatus(runRecord.status)}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Planning Horizon</p>
          <p className="text-sm font-mono text-foreground">
            {formatRunHorizon(runRecord.horizonDays)}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Started / Completed</p>
          <p className="text-sm font-mono text-foreground">
            {formatRunCreatedAt(runRecord)}
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            {formatRunCompletedAt(runRecord)}
          </p>
        </div>
      </div>

      {runRecord.status === "CANCELLED" && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <p className="text-sm text-destructive">
            This run was cancelled before the calculation completed. Any rows
            shown below are partial and must not be treated as a plan.
          </p>
        </div>
      )}

      {resultsLoaded && runRecord.status === "COMPLETED" && !hasResults && (
        <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            This run completed successfully and produced no material
            requirements or replenishment recommendations. That means no open
            sales-order demand fell inside the{" "}
            {formatRunHorizon(runRecord.horizonDays)} horizon, or all of it was
            covered by existing stock.
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Execution Log &amp; Summary Trace
        </h3>
        {sectionNotice(messages, "Planning messages")}
        <EntityDataTable
          data={messageRows}
          columns={[
            {
              accessorKey: "severity",
              header: "Severity",
              cell: ({ row }) => (
                <span
                  className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full border ${severityClassName(
                    row.original.severity,
                  )}`}
                >
                  {row.original.severity}
                </span>
              ),
            },
            {
              accessorKey: "message",
              header: "Message",
              cell: ({ row }) => (
                <span className="text-xs text-foreground">
                  {row.original.message}
                </span>
              ),
            },
            {
              accessorKey: "createdAt",
              header: "Logged At",
              cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate(row.original.createdAt)}
                </span>
              ),
            },
          ]}
          searchPlaceholder="Search planning messages..."
          borderless
          loading={messages.status === "loading"}
          emptyTitle="No planning messages"
          emptyMessage="This run has not produced any planning log messages."
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Factory className="w-4 h-4 text-primary" />
          Gross Demand Processing Matrix
        </h3>
        {sectionNotice(requirements, "Gross demand matrix")}
        <EntityDataTable
          data={requirementRows}
          columns={[
            {
              accessorKey: "sku",
              header: "Component SKU",
              cell: ({ row }) => (
                <span className="font-mono text-xs font-bold text-primary">
                  {row.original.sku || "—"}
                </span>
              ),
            },
            {
              accessorKey: "componentName",
              header: "Description",
              cell: ({ row }) => (
                <span className="text-xs text-foreground">
                  {row.original.componentName || "—"}
                </span>
              ),
            },
            {
              accessorKey: "grossDemand",
              header: "Gross Demand",
              cell: ({ row }) => (
                <span className="font-mono text-xs text-foreground">
                  {row.original.grossDemand} units
                </span>
              ),
            },
            {
              accessorKey: "availableStock",
              header: "On Hand",
              cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground">
                  {row.original.availableStock} units
                </span>
              ),
            },
            {
              accessorKey: "reservedStock",
              header: "Reserved",
              cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground">
                  {row.original.reservedStock} units
                </span>
              ),
            },
            {
              accessorKey: "shortageQuantity",
              header: "Net Shortage",
              cell: ({ row }) =>
                row.original.shortageQuantity <= 0 ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    0 (Covered)
                  </span>
                ) : (
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                    {row.original.shortageQuantity} units
                  </span>
                ),
            },
            {
              accessorKey: "requiredDate",
              header: "Required By",
              cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate(row.original.requiredDate)}
                </span>
              ),
            },
            {
              accessorKey: "recommendedAction",
              header: "Action",
              cell: ({ row }) => (
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {row.original.recommendedAction}
                </span>
              ),
            },
          ]}
          searchPlaceholder="Search gross requirements..."
          borderless
          loading={requirements.status === "loading"}
          emptyTitle="No gross requirements"
          emptyMessage="This run recorded no material requirements for the planning horizon."
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            Planned Purchase Orders
          </h3>
          {sectionNotice(purchases, "Purchase recommendations")}
          <EntityDataTable
            data={purchaseRows}
            columns={[
              {
                accessorKey: "plannedPoNumber",
                header: "Planned PO",
                cell: ({ row }) => (
                  <span className="font-mono text-xs font-bold text-primary">
                    {row.original.plannedPoNumber || "—"}
                  </span>
                ),
              },
              {
                accessorKey: "componentSku",
                header: "Component",
                cell: ({ row }) => (
                  <div>
                    <p className="font-mono text-xs font-semibold text-foreground">
                      {row.original.componentSku || "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.original.componentName || "—"}
                    </p>
                  </div>
                ),
              },
              {
                accessorKey: "quantityToOrder",
                header: "Qty",
                cell: ({ row }) => (
                  <span className="font-mono text-xs text-foreground">
                    {row.original.quantityToOrder} units
                  </span>
                ),
              },
              {
                accessorKey: "releaseDate",
                header: "Must Release By",
                cell: ({ row }) => (
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDate(row.original.releaseDate)}
                  </span>
                ),
              },
            ]}
            searchPlaceholder="Search planned purchase orders..."
            borderless
            loading={purchases.status === "loading"}
            emptyTitle="No purchase recommendations"
            emptyMessage="No purchased components were short inside this run's horizon."
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Factory className="w-4 h-4 text-primary" />
            Planned Production Orders
          </h3>
          {sectionNotice(production, "Production recommendations")}
          <EntityDataTable
            data={productionRows}
            columns={[
              {
                accessorKey: "plannedOrderNumber",
                header: "Planned Order",
                cell: ({ row }) => (
                  <span className="font-mono text-xs font-bold text-primary">
                    {row.original.plannedOrderNumber || "—"}
                  </span>
                ),
              },
              {
                accessorKey: "assemblySku",
                header: "Assembly",
                cell: ({ row }) => (
                  <div>
                    <p className="font-mono text-xs font-semibold text-foreground">
                      {row.original.assemblySku || "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.original.assemblyName || "—"}
                    </p>
                  </div>
                ),
              },
              {
                accessorKey: "suggestedQuantity",
                header: "Qty",
                cell: ({ row }) => (
                  <span className="font-mono text-xs text-foreground">
                    {row.original.suggestedQuantity} units
                  </span>
                ),
              },
              {
                accessorKey: "scheduledCompletionDate",
                header: "Suggested Completion",
                cell: ({ row }) => (
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDate(row.original.scheduledCompletionDate)}
                  </span>
                ),
              },
            ]}
            searchPlaceholder="Search planned production orders..."
            borderless
            loading={production.status === "loading"}
            emptyTitle="No production recommendations"
            emptyMessage="No manufactured items were short inside this run's horizon."
          />
        </div>
      </div>
    </div>
  );
}
