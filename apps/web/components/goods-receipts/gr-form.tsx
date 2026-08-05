"use client";

import * as React from "react";
import {
  useForm,
  useFieldArray,
  SubmitHandler,
  Controller,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  goodsReceiptsApi,
  type GoodsReceiptDto,
  type CreateGoodsReceiptPayload,
} from "@/lib/api/goods-receipts-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

const grLineSchema = z.object({
  poLineId: z.string().min(1, "PO line ID is required"),
  componentId: z.string().min(1, "Component is required"),
  locationId: z.string().min(1, "Destination location is required"),
  quantityReceived: z.number().min(1, "Quantity received must be at least 1"),
  maxRemaining: z.number().min(0),
});

const grSchema = z.object({
  purchaseOrderId: z.string().min(1, "Purchase Order selection is required"),
  packingSlipNumber: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  lines: z
    .array(grLineSchema)
    .min(1, "At least one line item must be received"),
});

export type GoodsReceiptFormValues = z.infer<typeof grSchema>;

interface GoodsReceiptFormProps {
  onSuccess: (savedGr: GoodsReceiptDto) => void;
  onCancel: () => void;
}

export function GoodsReceiptForm({
  onSuccess,
  onCancel,
}: GoodsReceiptFormProps) {
  const [openPos, setOpenPos] = React.useState<PurchaseOrderDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [componentsMap, setComponentsMap] = React.useState<
    Map<string, ComponentDto>
  >(new Map());
  const [selectedPo, setSelectedPo] = React.useState<PurchaseOrderDto | null>(
    null,
  );
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GoodsReceiptFormValues>({
    resolver: zodResolver(grSchema),
    defaultValues: {
      purchaseOrderId: "",
      packingSlipNumber: "",
      receivedAt: new Date().toISOString().split("T")[0],
      lines: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control,
    name: "lines",
  });

  React.useEffect(() => {
    Promise.all([
      purchaseOrdersApi.getAll(),
      locationsApi.getAll(),
      componentsApi.getAll(),
    ])
      .then(([pos, locs, comps]) => {
        const activePos = pos.filter(
          (p) => p.status === "ISSUED" || p.status === "PARTIALLY_RECEIVED",
        );
        setOpenPos(activePos);
        setLocations(locs);

        const map = new Map<string, ComponentDto>();
        for (const c of comps) {
          map.set(c.id, c);
        }
        setComponentsMap(map);
      })
      .catch(() => {});
  }, []);

  const defaultLocId = locations.length > 0 ? locations[0]?.id || "" : "";

  const handlePoSelect = (poId: string) => {
    setValue("purchaseOrderId", poId);
    const foundPo = openPos.find((p) => p.id === poId);
    if (!foundPo) {
      setSelectedPo(null);
      replace([]);
      return;
    }

    setSelectedPo(foundPo);
    const newLines = foundPo.lines
      .map((line) => {
        const remaining = line.quantityOrdered - line.quantityReceived;
        if (remaining <= 0) return null;

        const comp = componentsMap.get(line.componentId);
        const targetLocId = comp?.defaultLocationId || defaultLocId;

        return {
          poLineId: line.id,
          componentId: line.componentId,
          locationId: targetLocId,
          quantityReceived: remaining,
          maxRemaining: remaining,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    replace(newLines);
  };

  const watchedLines = watch("lines");
  const totalQuantityReceived = React.useMemo(() => {
    if (!watchedLines) return 0;
    return watchedLines.reduce(
      (sum, l) => sum + (Number(l.quantityReceived) || 0),
      0,
    );
  }, [watchedLines]);

  const onSubmit: SubmitHandler<GoodsReceiptFormValues> = async (values) => {
    setServerError(null);

    const validLines = values.lines.filter((l) => l.quantityReceived > 0);
    if (validLines.length === 0) {
      setServerError(
        "At least one item must have a quantity received greater than 0.",
      );
      return;
    }

    try {
      const payload: CreateGoodsReceiptPayload = {
        purchaseOrderId: values.purchaseOrderId,
        supplierId: selectedPo?.supplierId || "",
        packingSlipNumber: values.packingSlipNumber || null,
        receivedAt: values.receivedAt
          ? new Date(values.receivedAt).toISOString()
          : null,
        lines: validLines.map((l) => ({
          poLineId: l.poLineId,
          componentId: l.componentId,
          locationId: l.locationId,
          quantityReceived: l.quantityReceived,
        })),
      };
      const created = await goodsReceiptsApi.create(payload);
      onSuccess(created);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to process Goods Receipt");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="gr-po">
          Purchase Order <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="purchaseOrderId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(val) => {
                field.onChange(val ?? "");
                handlePoSelect(val ?? "");
              }}
            >
              <SelectTrigger id="gr-po">
                <SelectValue placeholder="Select an open Purchase Order..." />
              </SelectTrigger>
              <SelectContent>
                {openPos.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.poNumber} — ({po.status}) {po.currency}{" "}
                    {po.grandTotal.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.purchaseOrderId?.message && (
          <FieldError>{errors.purchaseOrderId.message}</FieldError>
        )}
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="gr-packing-slip">
            Packing Slip / Delivery Note #
          </FieldLabel>
          <Input
            id="gr-packing-slip"
            type="text"
            placeholder="e.g. PS-98765"
            {...register("packingSlipNumber")}
            className="uppercase font-mono"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="gr-date">Receipt Date</FieldLabel>
          <Input
            id="gr-date"
            type="date"
            {...register("receivedAt")}
            className="font-mono"
          />
        </Field>
      </div>

      {selectedPo && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Items to Receive <span className="text-destructive">*</span>
            </label>
            <span className="text-xs font-mono text-muted-foreground">
              Total Qty: {totalQuantityReceived} units
            </span>
          </div>

          {errors.lines?.root && (
            <p className="text-xs text-destructive">
              {errors.lines.root.message}
            </p>
          )}

          {fields.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {fields.map((field, index) => {
                const comp = componentsMap.get(field.componentId);
                return (
                  <div
                    key={field.id}
                    className="p-3 bg-muted/30 border border-border rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-semibold">
                        {comp ? comp.name : field.componentId}{" "}
                        <span className="font-mono text-muted-foreground">
                          ({comp?.sku})
                        </span>
                      </span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        Outstanding: {field.maxRemaining}{" "}
                        {comp?.unit || "units"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Destination Storage Location
                        </label>
                        <Controller
                          name={`lines.${index}.locationId`}
                          control={control}
                          render={({ field: locField }) => (
                            <Select
                              value={locField.value}
                              onValueChange={locField.onChange}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select location..." />
                              </SelectTrigger>
                              <SelectContent>
                                {locations.map((loc) => (
                                  <SelectItem key={loc.id} value={loc.id}>
                                    {loc.code} - {loc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Qty Received (Max: {field.maxRemaining})
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={field.maxRemaining}
                          {...register(`lines.${index}.quantityReceived`, {
                            valueAsNumber: true,
                          })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic p-3 bg-muted/20 border border-border rounded-lg">
              All line items on this Purchase Order have already been fully
              received!
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !selectedPo || fields.length === 0}
        >
          {isSubmitting && (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          )}
          Receive & Stock Inventory
        </Button>
      </div>
    </form>
  );
}
