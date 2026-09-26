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
import {
  supplierReturnsApi,
  type SupplierReturnDto,
} from "@/lib/api/supplier-returns-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/utils";

const supplierReturnSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
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
  const [suppliers, setSuppliers] = React.useState<SupplierDto[]>([]);
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrderDto[]>([]);
  const [loadingData, setLoadingData] = React.useState(true);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SupplierReturnFormValues>({
    resolver: zodResolver(supplierReturnSchema),
    defaultValues: {
      supplierId: "",
      purchaseOrderId: "",
      rmaNumber: "",
    },
  });

  const selectedSupplierId = watch("supplierId");

  React.useEffect(() => {
    let isMounted = true;
    setLoadingData(true);
    Promise.all([
      suppliersApi.getAll().catch(() => []),
      purchaseOrdersApi.getAll().catch(() => []),
    ])
      .then(([sups, pos]) => {
        if (!isMounted) return;
        setSuppliers(sups.filter((s) => s.isActive !== false));
        setPurchaseOrders(pos);
      })
      .catch((err) => {
        if (!isMounted) return;
        setServerError(
          err instanceof Error
            ? err.message
            : "Failed to load suppliers or purchase orders",
        );
      })
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const supplierOptions = React.useMemo<SearchableSelectOption[]>(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: s.code ? `Code: ${s.code}` : undefined,
      chip: s.code || undefined,
    }));
  }, [suppliers]);

  const filteredPurchaseOrders = React.useMemo(() => {
    if (!selectedSupplierId) return purchaseOrders;
    return purchaseOrders.filter((po) => po.supplierId === selectedSupplierId);
  }, [purchaseOrders, selectedSupplierId]);

  const poOptions = React.useMemo<SearchableSelectOption[]>(() => {
    return filteredPurchaseOrders.map((po) => {
      const totalNum = Number(po.grandTotal) || 0;
      return {
        value: po.id,
        label: po.poNumber,
        sublabel: `${po.status} • Total: ${formatCurrency(totalNum)}`,
        chip: po.status,
      };
    });
  }, [filteredPurchaseOrders]);

  const onSubmit = async (values: SupplierReturnFormValues) => {
    setServerError(null);
    try {
      const res = await supplierReturnsApi.create({
        supplierId: values.supplierId,
        purchaseOrderId: values.purchaseOrderId?.trim()
          ? values.purchaseOrderId.trim()
          : undefined,
        rmaNumber: values.rmaNumber?.trim()
          ? values.rmaNumber.trim()
          : undefined,
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
            Supplier <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="supplierId"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                id="supplierId"
                placeholder={
                  loadingData ? "Loading suppliers..." : "Select a supplier..."
                }
                searchPlaceholder="Search supplier by name or code..."
                emptyText="No matching suppliers found"
                disabled={loadingData || isSubmitting}
                value={field.value || ""}
                onValueChange={(val) => {
                  field.onChange(val ?? "");
                  const currentPoId = getValues("purchaseOrderId");
                  if (currentPoId) {
                    const po = purchaseOrders.find((p) => p.id === currentPoId);
                    if (po && po.supplierId !== val) {
                      setValue("purchaseOrderId", "");
                    }
                  }
                }}
                options={supplierOptions}
              />
            )}
          />
          {errors.supplierId && (
            <FieldError>{errors.supplierId.message}</FieldError>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="purchaseOrderId">Purchase Order #</FieldLabel>
            <Controller
              name="purchaseOrderId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="purchaseOrderId"
                  placeholder={
                    loadingData
                      ? "Loading purchase orders..."
                      : "Select a purchase order (optional)..."
                  }
                  searchPlaceholder="Search PO number..."
                  emptyText={
                    selectedSupplierId
                      ? "No purchase orders found for this supplier"
                      : "No purchase orders found"
                  }
                  disabled={loadingData || isSubmitting}
                  clearable={true}
                  value={field.value || ""}
                  onValueChange={(val) => {
                    field.onChange(val ?? "");
                    if (val) {
                      const selectedPo = purchaseOrders.find((p) => p.id === val);
                      if (selectedPo && selectedPo.supplierId) {
                        setValue("supplierId", selectedPo.supplierId, {
                          shouldValidate: true,
                        });
                      }
                    }
                  }}
                  options={poOptions}
                />
              )}
            />
            {errors.purchaseOrderId && (
              <FieldError>{errors.purchaseOrderId.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="rmaNumber">Supplier RMA #</FieldLabel>
            <Input
              id="rmaNumber"
              placeholder="e.g. VENDOR-RMA-88"
              disabled={isSubmitting}
              {...register("rmaNumber")}
            />
          </Field>
        </div>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting || loadingData}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Create Return
        </Button>
      </DialogShellFooter>
    </form>
  );
}
