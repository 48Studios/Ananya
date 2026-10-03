"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/ui/entity-selector";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  warehousePoliciesApi,
  type WarehousePolicyDto,
} from "@/lib/api/warehouse-policies-api";
import type { WarehousePolicyRow } from "@/lib/warehouse-policies";

/**
 * A policy is a set of rules for one warehouse. Saving the same warehouse again
 * updates its existing policy — the API keys policies by `warehouseId`.
 */
const policySchema = z.object({
  warehouseId: z.string().min(1, "Facility is required"),
  directedPicking: z.boolean(),
  directedPutaway: z.boolean(),
  enforceBinCapacity: z.boolean(),
  allowNegativeInventory: z.boolean(),
  defaultReceivingBinId: z.string().optional(),
  defaultProductionBinId: z.string().optional(),
  defaultShippingBinId: z.string().optional(),
});

export type WarehousePolicyFormValues = z.infer<typeof policySchema>;

interface WarehousePolicyFormProps {
  initialData?: WarehousePolicyRow | null;
  onSuccess: (saved: WarehousePolicyDto) => void;
  onCancel: () => void;
}

const NO_BIN = "__none__";

export function WarehousePolicyForm({
  initialData,
  onSuccess,
  onCancel,
}: WarehousePolicyFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const isEditing = Boolean(initialData);

  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WarehousePolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      warehouseId: initialData?.warehouseId ?? "",
      directedPicking: initialData?.directedPicking ?? false,
      directedPutaway: initialData?.directedPutaway ?? false,
      enforceBinCapacity: initialData?.enforceBinCapacity ?? false,
      allowNegativeInventory: initialData?.allowNegativeInventory ?? false,
      defaultReceivingBinId: initialData?.defaultReceivingBinId ?? "",
      defaultProductionBinId: initialData?.defaultProductionBinId ?? "",
      defaultShippingBinId: initialData?.defaultShippingBinId ?? "",
    },
  });

  React.useEffect(() => {
    // Default bins are location ids; offer the real bins rather than free text.
    locationsApi
      .getAll()
      .then((all) => setLocations(all ?? []))
      .catch(() => setLocations([]));
  }, []);

  const onSubmit = async (values: WarehousePolicyFormValues) => {
    setServerError(null);
    try {
      const saved = await warehousePoliciesApi.save({
        warehouseId: values.warehouseId,
        directedPicking: values.directedPicking,
        directedPutaway: values.directedPutaway,
        enforceBinCapacity: values.enforceBinCapacity,
        allowNegativeInventory: values.allowNegativeInventory,
        ...(values.defaultReceivingBinId
          ? { defaultReceivingBinId: values.defaultReceivingBinId }
          : {}),
        ...(values.defaultProductionBinId
          ? { defaultProductionBinId: values.defaultProductionBinId }
          : {}),
        ...(values.defaultShippingBinId
          ? { defaultShippingBinId: values.defaultShippingBinId }
          : {}),
      });
      onSuccess(saved);
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "Failed to save storage policy",
      );
    }
  };

  const booleanRules: Array<{
    name:
      | "directedPicking"
      | "directedPutaway"
      | "enforceBinCapacity"
      | "allowNegativeInventory";
    label: string;
    hint: string;
  }> = [
    {
      name: "directedPicking",
      label: "Directed picking",
      hint: "The system proposes the bin to pick from.",
    },
    {
      name: "directedPutaway",
      label: "Directed putaway",
      hint: "The system proposes the bin to put stock away in.",
    },
    {
      name: "enforceBinCapacity",
      label: "Enforce bin capacity",
      hint: "Reject moves that would exceed a bin's capacity.",
    },
    {
      name: "allowNegativeInventory",
      label: "Allow negative inventory",
      hint: "Permit issues that take a location below zero.",
    },
  ];

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
          <FieldLabel htmlFor="policy-warehouse">
            Facility <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="warehouseId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="policy-warehouse"
                entity="warehouse"
                value={field.value}
                onChange={(val) => field.onChange(val ?? "")}
                placeholder="Select warehouse facility..."
                creatable={false}
                disabled={isEditing}
              />
            )}
          />
          {errors.warehouseId?.message && (
            <FieldError>{errors.warehouseId.message}</FieldError>
          )}
        </Field>

        <div className="space-y-3">
          {booleanRules.map((rule) => (
            <Controller
              key={rule.name}
              name={rule.name}
              control={control}
              render={({ field }) => (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                  />
                  <span>
                    <span className="block text-xs font-medium text-foreground">
                      {rule.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {rule.hint}
                    </span>
                  </span>
                </label>
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ["defaultReceivingBinId", "Receiving bin"],
              ["defaultProductionBinId", "Production bin"],
              ["defaultShippingBinId", "Shipping bin"],
            ] as const
          ).map(([name, label]) => (
            <Field key={name}>
              <FieldLabel htmlFor={`policy-${name}`}>{label}</FieldLabel>
              <Controller
                name={name}
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_BIN}
                    onValueChange={(value) =>
                      field.onChange(value === NO_BIN ? "" : value)
                    }
                  >
                    <SelectTrigger id={`policy-${name}`}>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_BIN}>Not set</SelectItem>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.code} — {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          ))}
        </div>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Save Policy
        </Button>
      </DialogShellFooter>
    </form>
  );
}
