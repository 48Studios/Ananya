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
  warrantyClaimsApi,
  type WarrantyClaimDto,
} from "@/lib/api/warranty-claims-api";

const warrantyClaimSchema = z.object({
  claimReason: z.string().min(1, "Claim reason is required"),
  serialNumber: z.string().optional(),
  customerName: z.string().optional(),
  productName: z.string().optional(),
});

export type WarrantyClaimFormValues = z.infer<typeof warrantyClaimSchema>;

interface WarrantyClaimFormProps {
  onSuccess: (claim: WarrantyClaimDto) => void;
  onCancel: () => void;
}

export function WarrantyClaimForm({
  onSuccess,
  onCancel,
}: WarrantyClaimFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WarrantyClaimFormValues>({
    resolver: zodResolver(warrantyClaimSchema),
    defaultValues: {
      claimReason: "",
      serialNumber: "",
      customerName: "",
      productName: "",
    },
  });

  const onSubmit = async (values: WarrantyClaimFormValues) => {
    setServerError(null);
    try {
      const res = await warrantyClaimsApi.create({
        claimReason: values.claimReason,
        serialNumber: values.serialNumber,
        purchaseDate: new Date().toISOString().split("T")[0],
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to file warranty claim",
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
          <FieldLabel htmlFor="claimReason">
            Claim Reason / Issue Details{" "}
            <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="claimReason"
            placeholder="e.g. Component failure under normal operation"
            {...register("claimReason")}
          />
          {errors.claimReason && (
            <FieldError>{errors.claimReason.message}</FieldError>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="serialNumber">Serial Number</FieldLabel>
            <Input
              id="serialNumber"
              placeholder="e.g. SN-2026-90412"
              {...register("serialNumber")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="productName">Product Name</FieldLabel>
            <Input
              id="productName"
              placeholder="e.g. Servo Motor Controller"
              {...register("productName")}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="customerName">Customer Name</FieldLabel>
          <Input
            id="customerName"
            placeholder="e.g. AeroTech Systems"
            {...register("customerName")}
          />
        </Field>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          File Claim
        </Button>
      </DialogShellFooter>
    </form>
  );
}
