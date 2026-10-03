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
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { workOrdersApi, type WorkOrderDto } from "@/lib/api/work-orders-api";
import {
  materialConsumptionApi,
  type MaterialConsumptionDto,
} from "@/lib/api/material-consumption-api";

const materialConsumptionSchema = z.object({
  productionOrderId: z
    .string()
    .min(1, "Production order ID or number is required"),
});

export type MaterialConsumptionFormValues = z.infer<
  typeof materialConsumptionSchema
>;

interface MaterialConsumptionFormProps {
  onSuccess: (item: MaterialConsumptionDto) => void;
  onCancel: () => void;
}

export function MaterialConsumptionForm({
  onSuccess,
  onCancel,
}: MaterialConsumptionFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [workOrders, setWorkOrders] = React.useState<WorkOrderDto[]>([]);

  React.useEffect(() => {
    // The document is always created against a production order, so offer the
    // real orders instead of asking the user to paste an id.
    workOrdersApi
      .getAll()
      .then((all) => setWorkOrders(all ?? []))
      .catch(() => setWorkOrders([]));
  }, []);

  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MaterialConsumptionFormValues>({
    resolver: zodResolver(materialConsumptionSchema),
    defaultValues: {
      productionOrderId: "",
    },
  });

  const onSubmit = async (values: MaterialConsumptionFormValues) => {
    setServerError(null);
    try {
      const res = await materialConsumptionApi.create({
        productionOrderId: values.productionOrderId,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Failed to issue material to work order",
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
          <FieldLabel htmlFor="production-order">
            Work Order <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="productionOrderId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="production-order">
                  <SelectValue placeholder="Select the production order..." />
                </SelectTrigger>
                <SelectContent>
                  {workOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.productionNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.productionOrderId && (
            <FieldError>{errors.productionOrderId.message}</FieldError>
          )}
        </Field>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Issue Material
        </Button>
      </DialogShellFooter>
    </form>
  );
}
