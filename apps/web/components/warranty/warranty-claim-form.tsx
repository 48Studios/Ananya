"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
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
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  warrantyClaimsApi,
  type WarrantyClaimDto,
} from "@/lib/api/warranty-claims-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

const warrantyClaimSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  productId: z.string().min(1, "Product is required"),
  claimReason: z.string().min(1, "Claim reason is required"),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().min(1, "Purchase date is required"),
  expiryDate: z.string().min(1, "Warranty expiry date is required"),
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
  const [components, setComponents] = React.useState<ComponentDto[]>([]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WarrantyClaimFormValues>({
    resolver: zodResolver(warrantyClaimSchema),
    defaultValues: {
      customerId: "",
      productId: "",
      claimReason: "",
      serialNumber: "",
      purchaseDate: new Date().toISOString().slice(0, 10),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    },
  });

  React.useEffect(() => {
    // The claim must name the covered product; the API requires its component id.
    componentsApi
      .getAll()
      .then((all) => setComponents(all ?? []))
      .catch(() => setComponents([]));
  }, []);

  const onSubmit = async (values: WarrantyClaimFormValues) => {
    setServerError(null);
    try {
      const res = await warrantyClaimsApi.create({
        customerId: values.customerId,
        productId: values.productId,
        claimReason: values.claimReason,
        serialNumber: values.serialNumber,
        purchaseDate: values.purchaseDate,
        expiryDate: values.expiryDate,
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
          <FieldLabel htmlFor="warranty-customer">
            Customer <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="warranty-customer"
                entity="customer"
                value={field.value}
                onChange={(val) => field.onChange(val ?? "")}
                placeholder="Select the customer claiming warranty..."
                creatable={false}
              />
            )}
          />
          {errors.customerId && (
            <FieldError>{errors.customerId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="warranty-product">
            Product <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="productId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="warranty-product">
                  <SelectValue placeholder="Select the covered product..." />
                </SelectTrigger>
                <SelectContent>
                  {components.map((component) => (
                    <SelectItem key={component.id} value={component.id}>
                      {component.sku} — {component.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.productId && (
            <FieldError>{errors.productId.message}</FieldError>
          )}
        </Field>

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

        <Field>
          <FieldLabel htmlFor="serialNumber">Serial Number</FieldLabel>
          <Input
            id="serialNumber"
            placeholder="e.g. SN-2026-90412"
            {...register("serialNumber")}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="purchaseDate">
              Purchase Date <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="purchaseDate"
              type="date"
              className="font-mono"
              {...register("purchaseDate")}
            />
            {errors.purchaseDate && (
              <FieldError>{errors.purchaseDate.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="expiryDate">
              Warranty Expiry <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="expiryDate"
              type="date"
              className="font-mono"
              {...register("expiryDate")}
            />
            {errors.expiryDate && (
              <FieldError>{errors.expiryDate.message}</FieldError>
            )}
          </Field>
        </div>
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
