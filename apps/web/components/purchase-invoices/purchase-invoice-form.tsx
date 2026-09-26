"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  purchaseInvoicesApi,
  type PurchaseInvoiceDto,
} from "@/lib/api/purchase-invoices-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import {
  goodsReceiptsApi,
  type GoodsReceiptDto,
} from "@/lib/api/goods-receipts-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/utils";

const purchaseInvoiceLineSchema = z.object({
  componentId: z.string().min(1, "Component is required"),
  quantityBilled: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Unit price cannot be negative"),
});

const purchaseInvoiceSchema = z.object({
  vendorInvoiceNumber: z.string().min(1, "Vendor Invoice Number is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  purchaseOrderId: z.string().min(1, "Purchase Order is required"),
  goodsReceiptId: z.string().optional(),
  dueDate: z.string().min(1, "Due Date is required"),
  lines: z
    .array(purchaseInvoiceLineSchema)
    .min(1, "At least one line item is required"),
});

export type PurchaseInvoiceFormValues = {
  vendorInvoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string;
  goodsReceiptId?: string;
  dueDate: string;
  lines: {
    componentId: string;
    quantityBilled: number;
    unitPrice: number;
  }[];
};

interface PurchaseInvoiceFormProps {
  onSuccess: (invoice: PurchaseInvoiceDto) => void;
  onCancel: () => void;
}

export function PurchaseInvoiceForm({
  onSuccess,
  onCancel,
}: PurchaseInvoiceFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [suppliers, setSuppliers] = React.useState<SupplierDto[]>([]);
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrderDto[]>([]);
  const [goodsReceipts, setGoodsReceipts] = React.useState<GoodsReceiptDto[]>([]);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [loadingData, setLoadingData] = React.useState(true);

  // Default due date to 30 days from now
  const defaultDueDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0] || "";
  }, []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseInvoiceFormValues>({
    resolver: zodResolver(purchaseInvoiceSchema),
    defaultValues: {
      vendorInvoiceNumber: "",
      supplierId: "",
      purchaseOrderId: "",
      goodsReceiptId: "",
      dueDate: defaultDueDate,
      lines: [],
    },
  });

  const selectedSupplierId = watch("supplierId");
  const selectedPoId = watch("purchaseOrderId");
  const lines = watch("lines") || [];

  React.useEffect(() => {
    let isMounted = true;
    setLoadingData(true);
    Promise.all([
      suppliersApi.getAll().catch(() => []),
      purchaseOrdersApi.getAll().catch(() => []),
      goodsReceiptsApi.getAll().catch(() => []),
      componentsApi.getAll().catch(() => []),
    ])
      .then(([sups, pos, grs, comps]) => {
        if (!isMounted) return;
        setSuppliers(sups.filter((s) => s.isActive !== false));
        setPurchaseOrders(pos);
        setGoodsReceipts(grs);
        setComponents(comps);
      })
      .catch((err) => {
        if (!isMounted) return;
        setServerError(
          err instanceof Error
            ? err.message
            : "Failed to load master procurement data",
        );
      })
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // When PO changes, populate lines from PO lines
  React.useEffect(() => {
    if (!selectedPoId) return;
    const po = purchaseOrders.find((p) => p.id === selectedPoId);
    if (po && po.lines && po.lines.length > 0) {
      if (!selectedSupplierId && po.supplierId) {
        setValue("supplierId", po.supplierId);
      }
      const initialLines = po.lines.map((l) => ({
        componentId: l.componentId,
        quantityBilled: Number(l.quantityOrdered) || 1,
        unitPrice: Number(l.unitPrice) || 0,
      }));
      setValue("lines", initialLines, { shouldValidate: true });
    }
  }, [selectedPoId, purchaseOrders, selectedSupplierId, setValue]);

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

  const filteredGoodsReceipts = React.useMemo(() => {
    if (!selectedPoId) return goodsReceipts;
    return goodsReceipts.filter((gr) => gr.purchaseOrderId === selectedPoId);
  }, [goodsReceipts, selectedPoId]);

  const grOptions = React.useMemo<SearchableSelectOption[]>(() => {
    return [
      { value: "", label: "None / Not linked to GR" },
      ...filteredGoodsReceipts.map((gr) => ({
        value: gr.id,
        label: gr.grNumber,
        sublabel: `Received: ${new Date(gr.receivedAt).toLocaleDateString()} • Lines: ${gr.lines?.length || 0}`,
        chip: gr.status,
      })),
    ];
  }, [filteredGoodsReceipts]);

  const componentMap = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const componentOptions = React.useMemo<SearchableSelectOption[]>(() => {
    return components.map((c) => ({
      value: c.id,
      label: c.name,
      sublabel: c.sku ? `SKU: ${c.sku}` : c.manufacturerPartNumber ? `MPN: ${c.manufacturerPartNumber}` : undefined,
      chip: c.sku || undefined,
    }));
  }, [components]);

  const totalCalculated = React.useMemo(() => {
    return lines.reduce((sum, line) => {
      const q = Number(line.quantityBilled) || 0;
      const p = Number(line.unitPrice) || 0;
      return sum + q * p;
    }, 0);
  }, [lines]);

  const handleAddLine = () => {
    const defaultCompId = components[0]?.id || "";
    setValue("lines", [
      ...lines,
      { componentId: defaultCompId, quantityBilled: 1, unitPrice: 0 },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setValue(
      "lines",
      lines.filter((_, idx) => idx !== index),
      { shouldValidate: true },
    );
  };

  const handleLineChange = (
    index: number,
    field: "componentId" | "quantityBilled" | "unitPrice",
    val: string | number,
  ) => {
    const updated = [...lines];
    if (updated[index]) {
      updated[index] = {
        ...updated[index],
        [field]: val,
      };
      setValue("lines", updated, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: PurchaseInvoiceFormValues) => {
    setServerError(null);
    try {
      const invoice = await purchaseInvoicesApi.create({
        vendorInvoiceNumber: values.vendorInvoiceNumber.trim(),
        supplierId: values.supplierId,
        purchaseOrderId: values.purchaseOrderId,
        goodsReceiptId: values.goodsReceiptId?.trim() ? values.goodsReceiptId.trim() : undefined,
        dueDate: values.dueDate,
        lines: values.lines.map((l) => ({
          componentId: l.componentId,
          quantityBilled: Number(l.quantityBilled),
          unitPrice: Number(l.unitPrice),
        })),
      });
      onSuccess(invoice);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to create purchase invoice",
      );
    }
  };

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">
          Loading procurement records...
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-0">
      <DialogShellBody className="space-y-5 max-h-[75vh] overflow-y-auto">
        {serverError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {serverError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Supplier */}
          <Field>
            <FieldLabel>
              Supplier <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="supplierId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  options={supplierOptions}
                  value={field.value}
                  onValueChange={(val: string) => {
                    field.onChange(val);
                    setValue("purchaseOrderId", "");
                  }}
                  placeholder="Select a supplier..."
                  searchPlaceholder="Search supplier name or code..."
                />
              )}
            />
            {errors.supplierId && (
              <FieldError>{errors.supplierId.message}</FieldError>
            )}
          </Field>

          {/* Purchase Order */}
          <Field>
            <FieldLabel>
              Reference Purchase Order <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="purchaseOrderId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  options={poOptions}
                  value={field.value}
                  onValueChange={(val: string) => field.onChange(val)}
                  placeholder={
                    selectedSupplierId
                      ? "Select PO for supplier..."
                      : "Select supplier first..."
                  }
                  searchPlaceholder="Search PO number..."
                  disabled={!selectedSupplierId && poOptions.length === 0}
                />
              )}
            />
            {errors.purchaseOrderId && (
              <FieldError>{errors.purchaseOrderId.message}</FieldError>
            )}
          </Field>

          {/* Vendor Invoice Number */}
          <Field>
            <FieldLabel>
              Vendor Invoice Number <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              {...register("vendorInvoiceNumber")}
              placeholder="e.g. INV-9821"
            />
            {errors.vendorInvoiceNumber && (
              <FieldError>{errors.vendorInvoiceNumber.message}</FieldError>
            )}
          </Field>

          {/* Due Date */}
          <Field>
            <FieldLabel>
              Due Date <span className="text-destructive">*</span>
            </FieldLabel>
            <Input type="date" {...register("dueDate")} />
            {errors.dueDate && (
              <FieldError>{errors.dueDate.message}</FieldError>
            )}
          </Field>

          {/* Goods Receipt (Optional) */}
          <Field className="sm:col-span-2">
            <FieldLabel>
              Linked Goods Receipt <span className="text-xs text-muted-foreground font-normal">(Optional for 3-way quantity matching)</span>
            </FieldLabel>
            <Controller
              name="goodsReceiptId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  options={grOptions}
                  value={field.value || ""}
                  onValueChange={(val: string) => field.onChange(val)}
                  placeholder="Select Goods Receipt..."
                  searchPlaceholder="Search GR number..."
                />
              )}
            />
          </Field>
        </div>

        {/* Line Items Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Invoice Line Items
              </h4>
              <p className="text-xs text-muted-foreground">
                Itemized components, billed quantities, and prices matching the vendor bill.
              </p>
            </div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleAddLine}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Line
            </Button>
          </div>

          {errors.lines && (
            <p className="text-xs text-destructive">
              {errors.lines.message || "Please provide valid line items."}
            </p>
          )}

          {lines.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-lg bg-muted/20">
              <Receipt className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
              <p className="text-xs font-medium text-foreground">No line items added</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select a Purchase Order above to auto-populate lines, or click Add Line.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Component</th>
                    <th className="px-3 py-2 font-medium w-28">Qty Billed</th>
                    <th className="px-3 py-2 font-medium w-32">Unit Price</th>
                    <th className="px-3 py-2 font-medium w-28 text-right">Line Total</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const lineTotal =
                      (Number(line.quantityBilled) || 0) *
                      (Number(line.unitPrice) || 0);

                    return (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-3 py-2">
                          <Controller
                            name={`lines.${idx}.componentId`}
                            control={control}
                            render={({ field }) => (
                              <SearchableSelect
                                options={componentOptions}
                                value={field.value}
                                onValueChange={(val: string) => {
                                  field.onChange(val);
                                  handleLineChange(idx, "componentId", val);
                                }}
                                placeholder="Select component..."
                                searchPlaceholder="Search component name or code..."
                              />
                            )}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            className="h-8 text-xs font-mono"
                            value={line.quantityBilled}
                            onChange={(e) =>
                              handleLineChange(
                                idx,
                                "quantityBilled",
                                Number(e.target.value),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 text-xs font-mono"
                            value={line.unitPrice}
                            onChange={(e) =>
                              handleLineChange(
                                idx,
                                "unitPrice",
                                Number(e.target.value),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium">
                          {formatCurrency(lineTotal)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lines.length === 1}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">
                      Grand Total:
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground text-sm">
                      {formatCurrency(totalCalculated)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton onClick={onCancel} disabled={isSubmitting} />
        <Button type="submit" disabled={isSubmitting || lines.length === 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Recording Invoice...
            </>
          ) : (
            "Create Purchase Invoice"
          )}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
