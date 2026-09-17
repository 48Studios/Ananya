"use client";

import * as React from "react";
import {
  useForm,
  useFieldArray,
  SubmitHandler,
  Controller,
  FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  initialPo?: PurchaseOrderDto | null;
  initialPurchaseOrderId?: string;
  onSuccess: (savedGr: GoodsReceiptDto) => void;
  onCancel: () => void;
}

export function GoodsReceiptForm({
  initialPo,
  initialPurchaseOrderId,
  onSuccess,
  onCancel,
}: GoodsReceiptFormProps) {
  const [openPos, setOpenPos] = React.useState<PurchaseOrderDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [componentsMap, setComponentsMap] = React.useState<
    Map<string, ComponentDto>
  >(new Map());
  const [selectedPo, setSelectedPo] = React.useState<PurchaseOrderDto | null>(
    initialPo || null,
  );
  const [loadingData, setLoadingData] = React.useState(true);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const poIdToUse = initialPo?.id || initialPurchaseOrderId || "";

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
      purchaseOrderId: poIdToUse,
      packingSlipNumber: "",
      receivedAt: new Date().toISOString().split("T")[0],
      lines: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control,
    name: "lines",
  });

  const populateLines = React.useCallback(
    (
      targetPo: PurchaseOrderDto,
      locList: LocationDto[],
      compMap: Map<string, ComponentDto>,
    ) => {
      setSelectedPo(targetPo);
      setValue("purchaseOrderId", targetPo.id);

      const fallbackLocId = locList.length > 0 ? locList[0]?.id || "" : "";
      const newLines = (targetPo.lines || [])
        .map((line) => {
          const remaining = line.quantityOrdered - line.quantityReceived;
          if (remaining <= 0) return null;

          const comp = compMap.get(line.componentId);
          const hasDefaultLoc =
            comp?.defaultLocationId &&
            locList.some((l) => l.id === comp.defaultLocationId);
          const targetLocId = hasDefaultLoc
            ? comp.defaultLocationId!
            : fallbackLocId;

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
    },
    [setValue, replace],
  );

  React.useEffect(() => {
    let isMounted = true;
    setLoadingData(true);

    Promise.all([
      purchaseOrdersApi.getAll(),
      locationsApi.getAll(),
      componentsApi.getAll(),
      poIdToUse && (!initialPo || !initialPo.lines || initialPo.lines.length === 0)
        ? purchaseOrdersApi.getById(poIdToUse).catch(() => null)
        : Promise.resolve(initialPo || null),
    ])
      .then(([pos, locs, comps, directPo]) => {
        if (!isMounted) return;

        const activePos = pos.filter(
          (p) => p.status !== "CANCELLED" && p.status !== "FULFILLED",
        );
        setOpenPos(activePos);
        setLocations(locs);

        const map = new Map<string, ComponentDto>();
        for (const c of comps) {
          map.set(c.id, c);
        }
        setComponentsMap(map);

        const activeTargetPo = directPo || activePos.find((p) => p.id === poIdToUse);
        if (activeTargetPo) {
          populateLines(activeTargetPo, locs, map);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error("Failed to load Goods Receipt form dependencies:", err);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, [poIdToUse, initialPo, populateLines]);

  const handlePoSelect = async (poId: string) => {
    if (!poId) {
      setSelectedPo(null);
      setValue("purchaseOrderId", "");
      replace([]);
      return;
    }

    setValue("purchaseOrderId", poId);
    let targetPo = openPos.find((p) => p.id === poId);

    // If target PO lines are missing or empty, fetch the full PO
    if (!targetPo || !targetPo.lines || targetPo.lines.length === 0) {
      try {
        targetPo = await purchaseOrdersApi.getById(poId);
      } catch (e) {
        console.error("Failed to load PO details for receiving:", e);
      }
    }

    if (targetPo) {
      populateLines(targetPo, locations, componentsMap);
    } else {
      setSelectedPo(null);
      replace([]);
    }
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

    const validLines = values.lines.filter((l) => Number(l.quantityReceived) > 0);
    if (validLines.length === 0) {
      setServerError(
        "At least one item must have a quantity received greater than 0.",
      );
      return;
    }

    if (locations.length === 0) {
      setServerError(
        "No storage locations found in the system. Please create a warehouse location before receiving inventory.",
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
          quantityReceived: Number(l.quantityReceived),
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

  const onInvalid = (formErrors: FieldErrors<GoodsReceiptFormValues>) => {
    console.error("Goods receipt form validation errors:", formErrors);
    if (formErrors.lines) {
      setServerError(
        "Please select a destination storage location and enter a valid quantity for all items.",
      );
    } else if (formErrors.purchaseOrderId) {
      setServerError("Please select a valid purchase order.");
    } else {
      setServerError("Please resolve highlighted form errors before continuing.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogShellBody className="space-y-4">
        {serverError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {locations.length === 0 && !loadingData && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              No warehouse storage locations found. Please create at least one
              location under Warehouse &gt; Locations.
            </span>
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
              <SearchableSelect
                id="gr-po"
                placeholder="Select an open Purchase Order..."
                searchPlaceholder="Search PO number or supplier..."
                emptyText="No open Purchase Orders available for receiving"
                value={field.value || ""}
                onValueChange={(val) => {
                  field.onChange(val ?? "");
                  handlePoSelect(val ?? "");
                }}
                options={openPos.map((po) => {
                  const totalNum = Number(po.grandTotal) || 0;
                  return {
                    value: po.id,
                    label: po.poNumber,
                    chip: po.status,
                    sublabel: `${po.currency || "INR"} ${totalNum.toFixed(2)}`,
                  };
                })}
              />
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
                  const lineErr = errors.lines?.[index];
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
                            Destination Storage Location{" "}
                            <span className="text-destructive">*</span>
                          </label>
                          <Controller
                            name={`lines.${index}.locationId`}
                            control={control}
                            render={({ field: locField }) => (
                              <SearchableSelect
                                value={locField.value || ""}
                                onValueChange={locField.onChange}
                                placeholder="Select location..."
                                searchPlaceholder="Search locations..."
                                triggerClassName="h-8 text-xs"
                                options={locations.map((loc) => ({
                                  value: loc.id,
                                  label: loc.name,
                                  chip: loc.code,
                                }))}
                              />
                            )}
                          />
                          {lineErr?.locationId?.message && (
                            <p className="text-[10px] text-destructive">
                              {lineErr.locationId.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground">
                            Qty Received (Max: {field.maxRemaining}){" "}
                            <span className="text-destructive">*</span>
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
                          {lineErr?.quantityReceived?.message && (
                            <p className="text-[10px] text-destructive">
                              {lineErr.quantityReceived.message}
                            </p>
                          )}
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
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button
          type="submit"
          size="sm"
          disabled={
            isSubmitting ||
            loadingData ||
            !selectedPo ||
            fields.length === 0 ||
            locations.length === 0
          }
        >
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Receive &amp; Stock Inventory
        </Button>
      </DialogShellFooter>
    </form>
  );
}
