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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  suppliersApi,
  type SupplierDto,
  type CreateSupplierPayload,
  type UpdateSupplierPayload,
} from "@/lib/api/suppliers-api";

export const STANDARD_PAYMENT_TERMS = [
  { value: "PREPAID", label: "PREPAID — 100% Advance / Upfront" },
  { value: "PIA", label: "PIA — Payment In Advance" },
  { value: "COD", label: "COD — Cash On Delivery" },
  { value: "NET7", label: "NET 7 — Net 7 Days" },
  { value: "NET15", label: "NET 15 — Net 15 Days" },
  { value: "NET30", label: "NET 30 — Net 30 Days (Standard)" },
  { value: "NET45", label: "NET 45 — Net 45 Days" },
  { value: "NET60", label: "NET 60 — Net 60 Days" },
  { value: "NET90", label: "NET 90 — Net 90 Days" },
  { value: "EOM", label: "EOM — End of Month" },
  { value: "2/10 NET 30", label: "2/10 NET 30 — 2% 10 Days, Net 30" },
  { value: "CUSTOM", label: "Custom Payment Term..." },
] as const;

const STANDARD_TERM_VALUES = new Set<string>([
  "PREPAID",
  "PIA",
  "COD",
  "NET7",
  "NET15",
  "NET30",
  "NET45",
  "NET60",
  "NET90",
  "EOM",
  "2/10 NET 30",
]);

const supplierSchema = z.object({
  code: z
    .string()
    .min(1, "Supplier code is required")
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, "Supplier name is required")
    .transform((val) => val.trim()),
  taxId: z.string().optional().nullable(),
  paymentTerms: z
    .string()
    .min(1, "Payment terms are required")
    .transform((val) => val.trim().toUpperCase()),
  currency: z
    .string()
    .min(1, "Currency code is required")
    .transform((val) => val.trim().toUpperCase()),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;

interface SupplierFormProps {
  initialData?: SupplierDto | null;
  onSuccess: (savedSupplier: SupplierDto) => void;
  onCancel: () => void;
}

export function SupplierForm({
  initialData,
  onSuccess,
  onCancel,
}: SupplierFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const initialTerm = initialData?.paymentTerms?.trim().toUpperCase() ?? "NET30";
  const isInitialCustom = initialTerm !== "" && !STANDARD_TERM_VALUES.has(initialTerm);

  const [selectedTermCategory, setSelectedTermCategory] = React.useState<string>(
    isInitialCustom ? "CUSTOM" : initialTerm,
  );
  const [customTermText, setCustomTermText] = React.useState<string>(
    isInitialCustom ? initialTerm : "",
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      code: initialData?.code ?? "",
      name: initialData?.name ?? "",
      taxId: initialData?.taxId ?? "",
      paymentTerms: initialTerm,
      currency: initialData?.currency ?? "INR",
    },
  });

  const handleSelectTerm = (val: string | null) => {
    const selected = val || "NET30";
    setSelectedTermCategory(selected);
    if (selected === "CUSTOM") {
      setValue("paymentTerms", customTermText || "");
    } else {
      setValue("paymentTerms", selected);
    }
  };

  const handleCustomTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setCustomTermText(val);
    setValue("paymentTerms", val);
  };

  const onSubmit = async (values: SupplierFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        const payload: UpdateSupplierPayload = {
          code: values.code,
          name: values.name,
          taxId: values.taxId || null,
          paymentTerms: values.paymentTerms,
          currency: values.currency,
        };
        const updated = await suppliersApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateSupplierPayload = {
          code: values.code,
          name: values.name,
          taxId: values.taxId || null,
          paymentTerms: values.paymentTerms,
          currency: values.currency,
        };
        const created = await suppliersApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing ? "Failed to update supplier" : "Failed to create supplier",
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
          <FieldLabel htmlFor="supplier-code">
            Supplier Code <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="supplier-code"
            type="text"
            placeholder="e.g. SUP-ARROW-01"
            {...register("code")}
            className="uppercase font-mono"
          />
          {errors.code?.message && (
            <FieldError>{errors.code.message}</FieldError>
          )}
        </Field>

        {/* Name */}
        <Field>
          <FieldLabel htmlFor="supplier-name">
            Supplier Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="supplier-name"
            type="text"
            placeholder="e.g. Arrow Electronics Corp"
            {...register("name")}
          />
          {errors.name?.message && (
            <FieldError>{errors.name.message}</FieldError>
          )}
        </Field>

        {/* Tax ID */}
        <Field>
          <FieldLabel htmlFor="supplier-tax">Tax ID / GST Number</FieldLabel>
          <Input
            id="supplier-tax"
            type="text"
            placeholder="e.g. US-987654321 / GSTIN1234"
            {...register("taxId")}
            className="font-mono"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Payment Terms Select */}
          <Field>
            <FieldLabel htmlFor="supplier-terms">
              Payment Terms <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="paymentTerms"
              control={control}
              render={() => (
                <Select
                  value={selectedTermCategory}
                  onValueChange={handleSelectTerm}
                >
                  <SelectTrigger id="supplier-terms" className="text-xs">
                    <SelectValue placeholder="Select Payment Terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_PAYMENT_TERMS.map((term) => (
                      <SelectItem key={term.value} value={term.value}>
                        {term.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            {/* Custom Payment Term Input (when CUSTOM is chosen) */}
            {selectedTermCategory === "CUSTOM" && (
              <div className="mt-2">
                <Input
                  type="text"
                  placeholder="Enter custom terms (e.g. 50% ADV, 50% BL)"
                  value={customTermText}
                  onChange={handleCustomTermChange}
                  className="text-xs uppercase font-mono h-8"
                  autoFocus
                />
              </div>
            )}

            {errors.paymentTerms?.message && (
              <FieldError>{errors.paymentTerms.message}</FieldError>
            )}
          </Field>

          {/* Currency */}
          <Field>
            <FieldLabel htmlFor="supplier-currency">
              Currency <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="supplier-currency"
              type="text"
              placeholder="e.g. INR, USD, EUR"
              {...register("currency")}
              className="uppercase font-mono text-xs"
            />
            {errors.currency?.message && (
              <FieldError>{errors.currency.message}</FieldError>
            )}
          </Field>
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Supplier"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}

