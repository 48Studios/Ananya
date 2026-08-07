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
  finishedGoodsApi,
  type FinishedGoodDto,
} from "@/lib/api/finished-goods-api";

const finishedGoodsSchema = z.object({
  productionOrderId: z
    .string()
    .min(1, "Production order ID or code is required"),
});

export type FinishedGoodsFormValues = z.infer<typeof finishedGoodsSchema>;

interface FinishedGoodsFormProps {
  onSuccess: (item: FinishedGoodDto) => void;
  onCancel: () => void;
}

export function FinishedGoodsForm({
  onSuccess,
  onCancel,
}: FinishedGoodsFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FinishedGoodsFormValues>({
    resolver: zodResolver(finishedGoodsSchema),
    defaultValues: {
      productionOrderId: "",
    },
  });

  const onSubmit = async (values: FinishedGoodsFormValues) => {
    setServerError(null);
    try {
      const res = await finishedGoodsApi.create({
        productionOrderId: values.productionOrderId,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Failed to receive production batch",
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
          <FieldLabel htmlFor="productionOrderId">
            Production Order ID / Number <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="productionOrderId"
            placeholder="e.g. WO-2026-001 or PO ID"
            {...register("productionOrderId")}
          />
          {errors.productionOrderId && (
            <FieldError>{errors.productionOrderId.message}</FieldError>
          )}
        </Field>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Receive Batch
        </Button>
      </DialogShellFooter>
    </form>
  );
}
