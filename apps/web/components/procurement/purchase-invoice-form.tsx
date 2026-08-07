"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  purchaseInvoicesApi,
  type PurchaseInvoiceDto,
  type UpdatePurchaseInvoicePayload,
} from "@/lib/api/purchase-invoices-api";

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  supplierName: z.string().min(1, "Supplier is required"),
  poNumber: z.string().min(1, "Ref PO number is required"),
  amount: z.number().min(0.01, "Amount must be greater than zero"),
  dueDate: z.string().min(1, "Due date is required"),
  status: z.enum(["PAID", "UNPAID", "PARTIAL"]),
});

export type PurchaseInvoiceFormValues = z.infer<typeof invoiceSchema>;

interface PurchaseInvoiceFormProps {
  initialData?: PurchaseInvoiceDto | null;
  onSuccess: (saved: PurchaseInvoiceDto) => void;
  onCancel: () => void;
}

export function PurchaseInvoiceForm({
  initialData,
  onSuccess,
  onCancel,
}: PurchaseInvoiceFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const thirtyDaysLater = new Date(Date.now() + 30 * 86400 * 1000)
    .toISOString()
    .split("T")[0]!;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseInvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoiceNumber: initialData?.invoiceNumber ?? "",
      supplierName: initialData?.supplierName ?? "",
      poNumber: initialData?.poNumber ?? "PO-2026-",
      amount: initialData?.amount ?? 1500,
      dueDate: initialData?.dueDate ?? thirtyDaysLater,
      status: initialData?.status ?? "UNPAID",
    },
  });

  const onSubmit = async (values: PurchaseInvoiceFormValues) => {
    setServerError(null);
    try {
      const sanitizedValues: PurchaseInvoiceFormValues = {
        ...values,
        invoiceNumber: values.invoiceNumber.trim().toUpperCase(),
        poNumber: values.poNumber.trim().toUpperCase(),
      };
      if (isEditing && initialData) {
        const payload: UpdatePurchaseInvoicePayload = sanitizedValues;
        const updated = await purchaseInvoicesApi.update(
          initialData.id,
          payload,
        );
        onSuccess(updated);
      } else {
        const created = await purchaseInvoicesApi.create(sanitizedValues);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setServerError(err.message);
      else setServerError("Failed to save vendor invoice");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Invoice Number */}
      <Field>
        <FieldLabel htmlFor="invoice-number">
          Vendor Invoice Number <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="invoice-number"
          placeholder="e.g. INV-SUP-905"
          {...register("invoiceNumber")}
          className="uppercase font-mono"
        />
        {errors.invoiceNumber?.message && (
          <FieldError>{errors.invoiceNumber.message}</FieldError>
        )}
      </Field>

      {/* Supplier & PO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="invoice-supplier">
            Supplier <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="supplierName"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="invoice-supplier"
                entity="supplier"
                value={field.value}
                onChange={(val, label) => field.onChange(label || val)}
                placeholder="Select vendor..."
                creatable
              />
            )}
          />
          {errors.supplierName?.message && (
            <FieldError>{errors.supplierName.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="invoice-po">
            Reference PO Number <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="invoice-po"
            placeholder="e.g. PO-2026-088"
            {...register("poNumber")}
            className="uppercase font-mono"
          />
          {errors.poNumber?.message && (
            <FieldError>{errors.poNumber.message}</FieldError>
          )}
        </Field>
      </div>

      {/* Amount & Due Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="invoice-amount">
            Invoice Total Amount (INR) <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="invoice-amount"
            type="number"
            step="0.01"
            {...register("amount", { valueAsNumber: true })}
            className="font-mono"
          />
          {errors.amount?.message && (
            <FieldError>{errors.amount.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="invoice-due">
            Payment Due Date <span className="text-destructive">*</span>
          </FieldLabel>
          <Input id="invoice-due" type="date" {...register("dueDate")} />
          {errors.dueDate?.message && (
            <FieldError>{errors.dueDate.message}</FieldError>
          )}
        </Field>
      </div>

      {/* Status */}
      <Field>
        <FieldLabel htmlFor="invoice-status">Bill Status</FieldLabel>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="invoice-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNPAID">Unpaid Outstanding</SelectItem>
                <SelectItem value="PARTIAL">Partially Paid</SelectItem>
                <SelectItem value="PAID">Fully Paid</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {/* Form Actions */}
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
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          )}
          {isEditing ? "Save Changes" : "Create Vendor Invoice"}
        </Button>
      </div>
    </form>
  );
}
