"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  materialConsumptionApi,
  type MaterialConsumptionDto,
} from "@/lib/api/material-consumption-api";
import { formatDate } from "@/lib/utils";

interface ConsumptionLinesDialogProps {
  documentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Issue lines for one material consumption document.
 *
 * Lines are added while the document is a DRAFT; posting issues every line
 * against inventory and rebuilds the projections, so it cannot be undone from
 * here — the API refuses a second post.
 */
export function ConsumptionLinesDialog({
  documentId,
  onClose,
  onChanged,
}: ConsumptionLinesDialogProps) {
  const [document, setDocument] =
    React.useState<MaterialConsumptionDto | null>(null);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [componentId, setComponentId] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [quantityConsumed, setQuantityConsumed] = React.useState("1");
  const [batchNumber, setBatchNumber] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const [doc, componentList, locationList] = await Promise.all([
        materialConsumptionApi.getById(documentId),
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);
      setDocument(doc);
      setComponents(componentList);
      setLocations(locationList);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load consumption lines",
      );
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const componentLabel = (id: string) => {
    const match = components.find((component) => component.id === id);
    return match ? `${match.sku} — ${match.name}` : id;
  };

  const locationLabel = (id: string) => {
    const match = locations.find((location) => location.id === id);
    return match ? `${match.code} — ${match.name}` : id;
  };

  const handleAddLine = async () => {
    if (!documentId || !document) return;
    const quantity = Number(quantityConsumed);
    if (!componentId) return setFieldError("Select the component issued.");
    if (!locationId) return setFieldError("Select the issuing location.");
    if (!Number.isFinite(quantity) || quantity <= 0)
      return setFieldError("Quantity must be greater than zero.");

    setBusy(true);
    setFieldError(null);
    setError(null);
    try {
      await materialConsumptionApi.addLine(documentId, {
        componentId,
        locationId,
        quantityConsumed: quantity,
        ...(batchNumber ? { batchNumber } : {}),
      });
      setComponentId("");
      setLocationId("");
      setQuantityConsumed("1");
      setBatchNumber("");
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add the line");
    } finally {
      setBusy(false);
    }
  };

  const handlePost = async () => {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      await materialConsumptionApi.post(documentId);
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to post the document");
    } finally {
      setBusy(false);
    }
  };

  const isDraft = document?.status === "DRAFT";
  const lines = document?.lines ?? [];

  return (
    <DialogShell
      open={Boolean(documentId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Issue Lines${document ? ` — ${document.consumptionNumber}` : ""}`}
      description="Add the components issued to this production order, then post the document to move inventory."
      size="md"
    >
      <DialogShellBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading && !document ? (
          <p className="text-sm text-muted-foreground animate-pulse">
            Loading consumption lines...
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <StatusBadge status={document?.status || "DRAFT"} />
              <span className="text-xs text-muted-foreground font-mono">
                {document?.postedAt
                  ? `Posted ${formatDate(document.postedAt)}`
                  : "Not posted yet"}
              </span>
            </div>

            {lines.length === 0 ? (
              <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                No lines issued yet. Add the first component below.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Component</th>
                    <th className="pb-1 font-medium">Location</th>
                    <th className="pb-1 font-medium text-right">Consumed</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="py-1.5 font-mono">
                        {componentLabel(line.componentId)}
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        {locationLabel(line.locationId)}
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold">
                        {line.quantityConsumed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {isDraft && (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-foreground">Add a line</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="consumption-component">
                      Component
                    </FieldLabel>
                    <Select
                      value={componentId}
                      onValueChange={(value) => setComponentId(value ?? "")}
                    >
                      <SelectTrigger id="consumption-component">
                        <SelectValue placeholder="Select component..." />
                      </SelectTrigger>
                      <SelectContent>
                        {components.map((component) => (
                          <SelectItem key={component.id} value={component.id}>
                            {component.sku} — {component.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="consumption-location">
                      Issuing location
                    </FieldLabel>
                    <Select
                      value={locationId}
                      onValueChange={(value) => setLocationId(value ?? "")}
                    >
                      <SelectTrigger id="consumption-location">
                        <SelectValue placeholder="Select location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.code} — {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="consumption-quantity">
                      Quantity consumed
                    </FieldLabel>
                    <Input
                      id="consumption-quantity"
                      type="number"
                      step="any"
                      min="0"
                      value={quantityConsumed}
                      onChange={(event) =>
                        setQuantityConsumed(event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="consumption-batch">
                      Batch number (optional)
                    </FieldLabel>
                    <Input
                      id="consumption-batch"
                      value={batchNumber}
                      onChange={(event) => setBatchNumber(event.target.value)}
                    />
                  </Field>
                </div>
                {fieldError && <FieldError>{fieldError}</FieldError>}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddLine}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Add line
                </Button>
              </div>
            )}
          </>
        )}
      </DialogShellBody>

      <DialogShellFooter>
        <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
          Close
        </Button>
        {isDraft && (
          <Button
            size="sm"
            onClick={handlePost}
            disabled={busy || lines.length === 0}
            title={
              lines.length === 0
                ? "Add at least one line before posting"
                : undefined
            }
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Post document
          </Button>
        )}
      </DialogShellFooter>
    </DialogShell>
  );
}
