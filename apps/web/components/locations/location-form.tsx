"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
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
  locationsApi,
  type LocationDto,
  type CreateLocationPayload,
  type UpdateLocationPayload,
} from "@/lib/api/locations-api";

import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const locationSchema = z.object({
  code: z
    .string()
    .min(1, "Location code is required")
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, "Location name is required")
    .transform((val) => val.trim()),
  kind: z.string().min(1, "Location kind is required"),
  parentId: z.string().optional().nullable(),
});

export type LocationFormValues = z.infer<typeof locationSchema>;

interface LocationFormProps {
  initialData?: LocationDto | null;
  locations?: LocationDto[];
  onSuccess: (savedLocation: LocationDto) => void;
  onCancel: () => void;
}

export function LocationForm({
  initialData,
  locations = [],
  onSuccess,
  onCancel,
}: LocationFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const availableParents = React.useMemo(() => {
    if (!initialData) return locations;
    return locations.filter((loc) => loc.id !== initialData.id);
  }, [locations, initialData]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      code: initialData?.code ?? "",
      name: initialData?.name ?? "",
      kind: initialData?.kind ?? "warehouse",
      parentId: initialData?.parentId ?? "",
    },
  });

  const onSubmit = async (values: LocationFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        const payload: UpdateLocationPayload = {
          code: values.code,
          name: values.name,
          kind: values.kind,
          parentId: values.parentId || null,
        };
        const updated = await locationsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateLocationPayload = {
          code: values.code,
          name: values.name,
          kind: values.kind,
          parentId: values.parentId || null,
        };
        const created = await locationsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing ? "Failed to update location" : "Failed to create location",
        );
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

      {/* Code */}
      <Field>
        <FieldLabel htmlFor="location-code">
          Location Code <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="location-code"
          type="text"
          placeholder="e.g. WH-A-01"
          {...register("code")}
          className="uppercase"
        />
        {errors.code?.message && <FieldError>{errors.code.message}</FieldError>}
      </Field>

      {/* Name */}
      <Field>
        <FieldLabel htmlFor="location-name">
          Location Name <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="location-name"
          type="text"
          placeholder="e.g. Main Warehouse Row A"
          {...register("name")}
        />
        {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
      </Field>

      {/* Kind */}
      <Field>
        <FieldLabel htmlFor="location-kind">
          Location Kind <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="kind"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="location-kind">
                <SelectValue placeholder="Select location kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="aisle">Aisle</SelectItem>
                <SelectItem value="rack">Rack</SelectItem>
                <SelectItem value="shelf">Shelf</SelectItem>
                <SelectItem value="bin">Bin</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.kind?.message && <FieldError>{errors.kind.message}</FieldError>}
      </Field>

      {/* Parent Location */}
      <Field>
        <FieldLabel htmlFor="location-parent">Parent Location</FieldLabel>
        <Controller
          name="parentId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ?? "none"}
              onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
            >
              <SelectTrigger id="location-parent">
                <SelectValue placeholder="Select parent location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Top Level)</SelectItem>
                {availableParents.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.code} - {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {/* Form Action Buttons */}
      <Separator className="my-2" />
      <DialogFooter>
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
          {isEditing ? "Save Changes" : "Create Location"}
        </Button>
      </DialogFooter>
    </form>
  );
}
