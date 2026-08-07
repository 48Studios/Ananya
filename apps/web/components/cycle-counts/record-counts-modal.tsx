"use client";

import * as React from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import {
  cycleCountsApi,
  type CycleCountDto,
  type PhysicalCountEntryPayload,
} from "@/lib/api/cycle-counts-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

const lineCountSchema = z.object({
  lineId: z.string(),
  componentId: z.string(),
  systemQuantity: z.number(),
  countedQuantity: z.number().min(0, "Counted quantity cannot be negative"),
  unitOfMeasure: z.string(),
  notes: z.string().optional(),
});

const recordCountsSchema = z.object({
  counts: z.array(lineCountSchema),
});

export type RecordCountsFormValues = z.infer<typeof recordCountsSchema>;

interface RecordCountsModalProps {
  isOpen: boolean;
  cycleCount: CycleCountDto;
  onSuccess: (updated: CycleCountDto) => void;
  onClose: () => void;
}

export function RecordCountsModal({
  isOpen,
  cycleCount,
  onSuccess,
  onClose,
}: RecordCountsModalProps) {
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    componentsApi
      .getAll()
      .then((comps) => {
        const map: Record<string, ComponentDto> = {};
        for (const c of comps) map[c.id] = c;
        setComponentsMap(map);
      })
      .catch(() => null);
  }, []);

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordCountsFormValues>({
    resolver: zodResolver(recordCountsSchema),
    defaultValues: {
      counts: cycleCount.lines.map((l) => ({
        lineId: l.id,
        componentId: l.componentId,
        systemQuantity: l.systemQuantity,
        countedQuantity: l.countedQuantity,
        unitOfMeasure: l.unitOfMeasure,
        notes: l.notes || "",
      })),
    },
  });

  const { fields } = useFieldArray({
    control,
    name: "counts",
  });

  const watchedCounts = watch("counts");

  const onSubmit: SubmitHandler<RecordCountsFormValues> = async (values) => {
    setServerError(null);
    try {
      const payload: PhysicalCountEntryPayload[] = values.counts.map((c) => ({
        lineId: c.lineId,
        countedQuantity: Number(c.countedQuantity),
        notes: c.notes || undefined,
      }));
      const updated = await cycleCountsApi.recordPhysicalCounts(
        cycleCount.id,
        payload,
      );
      onSuccess(updated);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to record physical counts");
      }
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={`Record Physical Counts — ${cycleCount.countNumber}`}
      description="Enter actual warehouse floor quantities. System quantities remain read-only for variance review."
      size="md"
      closeDisabled={isSubmitting}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogShellBody className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardCheck className="size-4" />
            <span className="text-xs font-medium text-foreground">
              Variances are calculated automatically as counts are entered.
            </span>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="space-y-2">
            {fields.map((field, idx) => {
              const comp = componentsMap[field.componentId];
              const currentCounted =
                watchedCounts?.[idx]?.countedQuantity ?? field.countedQuantity;
              const variance =
                Math.round((currentCounted - field.systemQuantity) * 1000) /
                1000;

              return (
                <div
                  key={field.id}
                  className="p-3 bg-muted/20 border border-border rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  <div className="sm:col-span-5 space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      {comp ? comp.name : field.componentId}
                    </span>
                    {comp && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        SKU: {comp.sku}
                      </span>
                    )}
                  </div>

                  <div className="sm:col-span-2 text-right">
                    <span className="text-[10px] text-muted-foreground font-medium block uppercase">
                      System Qty
                    </span>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {field.systemQuantity} {field.unitOfMeasure}
                    </span>
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] text-muted-foreground font-medium block uppercase">
                      Counted Qty <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      {...register(`counts.${idx}.countedQuantity` as const, {
                        valueAsNumber: true,
                      })}
                      className="w-full px-2 py-1 text-xs bg-input/40 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono font-bold"
                    />
                    {errors.counts?.[idx]?.countedQuantity && (
                      <p className="text-[10px] text-destructive">
                        {errors.counts[idx]?.countedQuantity?.message}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2 text-right">
                    <span className="text-[10px] text-muted-foreground font-medium block uppercase">
                      Variance
                    </span>
                    {variance === 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        MATCH
                      </span>
                    ) : variance < 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/10 text-rose-700 dark:text-rose-400">
                        {variance}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                        +{variance}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogShellBody>
        <DialogShellFooter>
          <DialogShellCancelButton disabled={isSubmitting} />
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            )}
            Submit Physical Counts for Review
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
