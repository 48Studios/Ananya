"use client";

import * as React from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Loader2, ExternalLink, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
  type CreatePurchaseOrderPayload,
  type UpdatePurchaseOrderPayload,
} from "@/lib/api/purchase-orders-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { settingsApi } from "@/lib/api/settings-api";
import {
  SHIPPING_PROVIDERS,
  getAutoTrackingUrl,
} from "@/lib/shipping-carriers";

const poLineSchema = z.object({
  componentId: z.string().min(1, "Component is required"),
  vendorPartNumber: z.string().optional().nullable(),
  quantityOrdered: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Unit price cannot be negative"),
  taxRate: z.number().min(0, "Tax rate cannot be negative"),
});

const poSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  currency: z
    .string()
    .min(1, "Currency is required")
    .transform((val) => val.trim().toUpperCase()),
  expectedDeliveryDate: z.string().optional().nullable(),
  shippingProvider: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  trackingUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(poLineSchema).min(1, "At least one line item is required"),
});

export type PurchaseOrderFormValues = z.infer<typeof poSchema>;

interface PurchaseOrderFormProps {
  initialData?: PurchaseOrderDto | null;
  onSuccess: (savedPo: PurchaseOrderDto) => void;
  onCancel: () => void;
}

export function PurchaseOrderForm({
  initialData,
  onSuccess,
  onCancel,
}: PurchaseOrderFormProps) {
  const [suppliers, setSuppliers] = React.useState<SupplierDto[]>([]);
  const [availableComponents, setAvailableComponents] = React.useState<
    ComponentDto[]
  >([]);
  const [baseCurrency, setBaseCurrency] = React.useState<string>("INR");
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);
  const isDraft = !initialData || initialData.status === "DRAFT";

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      supplierId: initialData?.supplierId ?? "",
      currency: initialData?.currency ?? "INR",
      expectedDeliveryDate: initialData?.expectedDeliveryDate
        ? new Date(initialData.expectedDeliveryDate).toISOString().split("T")[0]
        : "",
      shippingProvider: initialData?.shippingProvider ?? "",
      trackingNumber: initialData?.trackingNumber ?? "",
      trackingUrl: initialData?.trackingUrl ?? "",
      notes: initialData?.notes ?? "",
      lines: initialData?.lines && initialData.lines.length > 0
        ? initialData.lines.map((l) => ({
            componentId: l.componentId,
            vendorPartNumber: l.vendorPartNumber ?? "",
            quantityOrdered: l.quantityOrdered,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate ?? 0,
          }))
        : [
            {
              componentId: "",
              vendorPartNumber: "",
              quantityOrdered: 1,
              unitPrice: 0,
              taxRate: 0,
            },
          ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  React.useEffect(() => {
    Promise.all([
      suppliersApi.getAll(),
      componentsApi.getAll(),
      settingsApi.getSystemSettings().catch(() => null),
    ])
      .then(([supData, compData, settingsData]) => {
        setSuppliers(supData);
        setAvailableComponents(compData);
        if (settingsData?.baseCurrency) {
          setBaseCurrency(settingsData.baseCurrency);
          if (!initialData) {
            setValue("currency", settingsData.baseCurrency);
          }
        }
      })
      .catch(() => {
        // Non-blocking load error
      });
  }, [initialData, setValue]);

  const watchedLines = watch("lines");
  const watchedCurrency = watch("currency") || "INR";
  const watchedProvider = watch("shippingProvider");
  const watchedTrackingNo = watch("trackingNumber");
  const watchedTrackingUrl = watch("trackingUrl");

  const computedTrackingUrl = React.useMemo(() => {
    return getAutoTrackingUrl(
      watchedProvider,
      watchedTrackingNo,
      watchedTrackingUrl,
    );
  }, [watchedProvider, watchedTrackingNo, watchedTrackingUrl]);

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    if (watchedLines && Array.isArray(watchedLines)) {
      for (const line of watchedLines) {
        const qty = Number(line.quantityOrdered) || 0;
        const price = Number(line.unitPrice) || 0;
        const taxPct = Number(line.taxRate) || 0;
        const lineSubtotal = qty * price;
        const lineTax = lineSubtotal * (taxPct / 100);
        subtotal += lineSubtotal;
        taxTotal += lineTax;
      }
    }
    return {
      subtotal,
      taxTotal,
      grandTotal: subtotal + taxTotal,
    };
  }, [watchedLines]);

  const onSubmit = async (values: PurchaseOrderFormValues) => {
    setServerError(null);
    try {
      const finalTrackingUrl =
        getAutoTrackingUrl(
          values.shippingProvider,
          values.trackingNumber,
          values.trackingUrl,
        ) || values.trackingUrl || null;

      if (isEditing && initialData) {
        const payload: UpdatePurchaseOrderPayload = {
          expectedDeliveryDate: values.expectedDeliveryDate || null,
          shippingProvider: values.shippingProvider || null,
          trackingNumber: values.trackingNumber || null,
          carrier: values.shippingProvider || null,
          trackingUrl: finalTrackingUrl,
          notes: values.notes || null,
          lines: isDraft
            ? values.lines.map((l) => ({
                componentId: l.componentId,
                vendorPartNumber: l.vendorPartNumber || null,
                quantityOrdered: l.quantityOrdered,
                unitPrice: l.unitPrice,
                taxRate: l.taxRate,
              }))
            : undefined,
        };
        const updated = await purchaseOrdersApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreatePurchaseOrderPayload = {
          supplierId: values.supplierId,
          currency: values.currency,
          expectedDeliveryDate: values.expectedDeliveryDate || null,
          shippingProvider: values.shippingProvider || null,
          trackingNumber: values.trackingNumber || null,
          carrier: values.shippingProvider || null,
          trackingUrl: finalTrackingUrl,
          notes: values.notes || null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            vendorPartNumber: l.vendorPartNumber || null,
            quantityOrdered: l.quantityOrdered,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
          })),
        };
        const created = await purchaseOrdersApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing
            ? "Failed to update purchase order"
            : "Failed to create purchase order",
        );
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogShellBody className="space-y-4">
        {serverError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {serverError}
          </div>
        )}

        {/* Supplier & Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="po-supplier">
              Supplier <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="supplierId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="po-supplier"
                  disabled={isEditing}
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val);
                    const selectedSup = suppliers.find((s) => s.id === val);
                    if (selectedSup) {
                      setValue("currency", selectedSup.currency || baseCurrency);
                    }
                  }}
                  placeholder="Select Supplier..."
                  searchPlaceholder="Search suppliers..."
                  options={suppliers.map((sup) => ({
                    value: sup.id,
                    label: sup.name,
                    chip: sup.code,
                  }))}
                />
              )}
            />
            {errors.supplierId?.message && (
              <FieldError>{errors.supplierId.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="po-currency">
              Currency <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="po-currency"
              type="text"
              placeholder="e.g. INR"
              disabled={isEditing && !isDraft}
              {...register("currency")}
              className="uppercase font-mono"
            />
          </Field>
        </div>

        {/* Delivery Date & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="po-delivery-date">
              Expected Delivery Date
            </FieldLabel>
            <Input
              id="po-delivery-date"
              type="date"
              {...register("expectedDeliveryDate")}
              className="font-mono"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="po-notes">Notes / Reference</FieldLabel>
            <Input
              id="po-notes"
              type="text"
              placeholder="Order terms or PO notes..."
              {...register("notes")}
            />
          </Field>
        </div>

        {/* Shipping & Logistics Tracking Section */}
        <div className="p-3 bg-muted/20 border border-border rounded-xl space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Truck className="w-3.5 h-3.5 text-primary" />
            <span>Shipment & Logistics Tracking</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Shipping Provider Select */}
            <Field>
              <FieldLabel htmlFor="po-shipping-provider">
                Shipping Provider / Courier
              </FieldLabel>
              <Controller
                name="shippingProvider"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || "none"}
                    onValueChange={(val) => {
                      const selected = val === "none" ? "" : val || "";
                      field.onChange(selected);
                    }}
                  >
                    <SelectTrigger id="po-shipping-provider" className="text-xs">
                      <SelectValue placeholder="Select Shipping Provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not Assigned --</SelectItem>
                      {SHIPPING_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.code} value={provider.code}>
                          {provider.name} ({provider.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {/* Tracking Number */}
            <Field>
              <FieldLabel htmlFor="po-tracking-number">
                Tracking / AWB Number
              </FieldLabel>
              <Input
                id="po-tracking-number"
                type="text"
                placeholder="e.g. 1234567890"
                {...register("trackingNumber")}
                className="font-mono uppercase text-xs"
              />
            </Field>
          </div>

          {/* Auto URL Constructor preview or manual link */}
          {computedTrackingUrl && (
            <div className="flex items-center justify-between p-2 bg-card rounded border border-border text-xs">
              <span className="text-muted-foreground truncate max-w-[280px]">
                Tracking Link:{" "}
                <span className="font-mono text-[11px] text-foreground">
                  {computedTrackingUrl}
                </span>
              </span>
              <a
                href={computedTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium inline-flex items-center gap-1 shrink-0 ml-2"
              >
                <span>Track Shipment</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Line Items Editor Section */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Line Items
              </label>
              {!isDraft && (
                <span className="ml-2 text-[11px] text-muted-foreground font-normal">
                  (Items locked in {initialData?.status} status)
                </span>
              )}
            </div>
            {isDraft && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  append({
                    componentId: "",
                    vendorPartNumber: "",
                    quantityOrdered: 1,
                    unitPrice: 0,
                    taxRate: 0,
                  })
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Line Item
              </Button>
            )}
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-3 bg-muted/30 border border-border rounded-lg space-y-2 relative"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  {/* Component Select */}
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Component
                    </label>
                    <Controller
                      name={`lines.${index}.componentId`}
                      control={control}
                      render={({ field: compField }) => (
                        <SearchableSelect
                          disabled={!isDraft}
                          value={compField.value}
                          onValueChange={compField.onChange}
                          placeholder="Select component..."
                          searchPlaceholder="Search components..."
                          triggerClassName="h-8 text-xs"
                          options={availableComponents.map((comp) => ({
                            value: comp.id,
                            label: comp.name,
                            chip: comp.sku,
                            sublabel: comp.unit ? `Unit: ${comp.unit}` : undefined,
                          }))}
                        />
                      )}
                    />
                  </div>

                  {/* Qty */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Qty
                    </label>
                    <Input
                      type="number"
                      min={1}
                      disabled={!isDraft}
                      {...register(`lines.${index}.quantityOrdered`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Price ({watchedCurrency})
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      disabled={!isDraft}
                      {...register(`lines.${index}.unitPrice`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  {/* Tax Rate % */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Tax %
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      disabled={!isDraft}
                      {...register(`lines.${index}.taxRate`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  {/* Delete Line */}
                  <div className="sm:col-span-1 flex items-center justify-end pb-1">
                    {isDraft && fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                        title="Remove line item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Order Summary Totals */}
        <div className="p-3 bg-muted/40 border border-border rounded-lg flex items-center justify-between text-xs font-mono">
          <div>
            <span className="text-muted-foreground">Subtotal: </span>
            <span className="font-semibold text-foreground mr-4">
              {watchedCurrency} {totals.subtotal.toFixed(2)}
            </span>
            <span className="text-muted-foreground">Tax: </span>
            <span className="font-semibold text-foreground">
              {watchedCurrency} {totals.taxTotal.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Grand Total: </span>
            <span className="text-sm font-bold text-foreground">
              {watchedCurrency} {totals.grandTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Purchase Order"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
