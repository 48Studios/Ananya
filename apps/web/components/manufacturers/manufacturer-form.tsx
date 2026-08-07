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
  manufacturersApi,
  type ManufacturerDto,
  type CreateManufacturerPayload,
  type UpdateManufacturerPayload,
} from "@/lib/api/manufacturers-api";

const manufacturerSchema = z.object({
  code: z
    .string()
    .min(1, "Manufacturer code is required")
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, "Manufacturer name is required")
    .transform((val) => val.trim()),
});

export type ManufacturerFormValues = z.infer<typeof manufacturerSchema>;

interface ManufacturerFormProps {
  initialData?: ManufacturerDto | null;
  onSuccess: (savedManufacturer: ManufacturerDto) => void;
  onCancel: () => void;
}

export function ManufacturerForm({
  initialData,
  onSuccess,
  onCancel,
}: ManufacturerFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ManufacturerFormValues>({
    resolver: zodResolver(manufacturerSchema),
    defaultValues: {
      code: initialData?.code ?? "",
      name: initialData?.name ?? "",
    },
  });

  const onSubmit = async (values: ManufacturerFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        const payload: UpdateManufacturerPayload = {
          code: values.code,
          name: values.name,
        };
        const updated = await manufacturersApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateManufacturerPayload = {
          code: values.code,
          name: values.name,
        };
        const created = await manufacturersApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing
            ? "Failed to update manufacturer"
            : "Failed to create manufacturer",
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

      {/* Code */}
      <Field>
        <FieldLabel htmlFor="mfr-code">
          Manufacturer Code <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="mfr-code"
          type="text"
          placeholder="e.g. MFR-ST-MICRO"
          {...register("code")}
          className="uppercase font-mono"
        />
        {errors.code?.message && <FieldError>{errors.code.message}</FieldError>}
      </Field>

      {/* Name */}
      <Field>
        <FieldLabel htmlFor="mfr-name">
          Manufacturer Name <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="mfr-name"
          type="text"
          placeholder="e.g. STMicroelectronics N.V."
          {...register("name")}
        />
        {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
      </Field>

      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          )}
          {isEditing ? "Save Changes" : "Create Manufacturer"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
