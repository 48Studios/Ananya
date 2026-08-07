"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  supplierReturnsApi,
  type SupplierReturnDto,
} from "@/lib/api/supplier-returns-api";

const supplierReturnSchema = z.object({
  supplierId: z.string().min(1, "Supplier ID is required"),
  purchaseOrderId: z.string().optional(),
  rmaNumber: z.string().optional(),
});

export type SupplierReturnFormValues = z.infer<typeof supplierReturnSchema>;

interface SupplierReturnFormProps {
  onSuccess: (ret: SupplierReturnDto) => void;
  onCancel: () => void;
}

export function SupplierReturnForm({
  onSuccess,
  onCancel,
}: SupplierReturnFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierReturnFormValues>({
    resolver: zodResolver(supplierReturnSchema),
    defaultValues: {
      supplierId: "",
      purchaseOrderId: "",
      rmaNumber: "",
    },
  });

  const onSubmit = async (values: SupplierReturnFormValues) => {
    setServerError(null);
    try {
      const res = await supplierReturnsApi.create({
        supplierId: values.supplierId,
        purchaseOrderId: values.purchaseOrderId,
        rmaNumber: values.rmaNumber,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to create supplier return",
      );
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

        <Field>
          <FieldLabel htmlFor="supplierId">
            Supplier ID / Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="supplierId"
            placeholder="e.g. Apex Electronics Ltd / Supplier ID"
            {...register("supplierId")}
          />
          {errors.supplierId && (
            <FieldError>{errors.supplierId.message}</FieldError>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="purchaseOrderId">Purchase Order #</FieldLabel>
            <Input
              id="purchaseOrderId"
              placeholder="e.g. PO-2026-001"
              {...register("purchaseOrderId")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="rmaNumber">Supplier RMA #</FieldLabel>
            <Input
              id="rmaNumber"
              placeholder="e.g. VENDOR-RMA-88"
              {...register("rmaNumber")}
            />
          </Field>
        </div>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Create Return
        </Button>
      </DialogShellFooter>
    </form>
  );
}
