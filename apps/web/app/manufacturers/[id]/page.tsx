"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  ArrowLeft,
  Factory,
  Package,
  Calendar,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DetailChip,
  DetailField,
  DetailFields,
  DetailMono,
  DetailText,
} from "@/components/ui/detail-field";
import { DetailTable } from "@/components/ui/detail-table";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  RecordTimestamps,
  SectionCard,
  SectionCardFooter,
} from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ManufacturerForm } from "@/components/manufacturers/manufacturer-form";
import {
  manufacturersApi,
  type ManufacturerDto,
} from "@/lib/api/manufacturers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

/**
 * One manufacturer, as a master-data record.
 *
 * The record itself is four fields wide, so the page keeps the identity section
 * short and gives the sourced components its own section rather than nesting a
 * list inside the identity card.
 */
export default function ViewManufacturerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [manufacturer, setManufacturer] =
    React.useState<ManufacturerDto | null>(null);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [mfr, allComps] = await Promise.all([
        manufacturersApi.getById(id),
        componentsApi.getAll().catch(() => []),
      ]);
      setManufacturer(mfr);
      setComponents(allComps.filter((c) => c.manufacturerId === id));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load manufacturer details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeComponentsCount = React.useMemo(
    () => components.filter((c) => c.isActive).length,
    [components],
  );
  const inactiveComponentsCount = React.useMemo(
    () => components.filter((c) => !c.isActive).length,
    [components],
  );

  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await manufacturersApi.delete(id);
      router.push("/manufacturers");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete manufacturer");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading manufacturer details..." />;
  }

  if (error || !manufacturer) {
    return (
      <ErrorState
        title="Manufacturer Not Found"
        message={error || "The requested manufacturer record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={manufacturer.name}
        description={`Code: ${manufacturer.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/manufacturers")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setIsDeleteOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </div>
        }
      />

      {/* Notifications */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {deleteError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {deleteError}
        </div>
      )}

      {/* Catalog Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          className="p-3.5"
          title="Total Components"
          value={components.length}
          subtitle="Catalog parts produced"
          icon={Package}
        />
        <StatCard
          className="p-3.5"
          title="Active Components"
          value={activeComponentsCount}
          subtitle="Active in inventory"
          icon={Factory}
        />
        <StatCard
          className="p-3.5"
          title="Archived Components"
          value={inactiveComponentsCount}
          subtitle="Inactive catalog parts"
          icon={Calendar}
        />
      </div>

      {/* Manufacturer Information */}
      <SectionCard
        title="Manufacturer Information"
        description="Master record identity and active status."
        icon={Info}
        contentClassName="p-0"
      >
        <DetailFields className="px-6 py-5">
          <DetailField label="Manufacturer ID">
            <DetailChip mono>{manufacturer.id}</DetailChip>
          </DetailField>

          <DetailField label="Status">
            <RecordStatusBadge isActive={manufacturer.isActive} />
          </DetailField>

          <DetailField label="Manufacturer Code">
            <DetailMono className="uppercase">{manufacturer.code}</DetailMono>
          </DetailField>

          <DetailField label="Manufacturer Name">
            <DetailText>{manufacturer.name}</DetailText>
          </DetailField>
        </DetailFields>

        <SectionCardFooter>
          <RecordTimestamps
            createdAt={manufacturer.createdAt}
            updatedAt={manufacturer.updatedAt}
          />
        </SectionCardFooter>
      </SectionCard>

      {/* Associated Components */}
      <SectionCard
        title="Associated Components"
        description="Catalog parts sourced from this manufacturer."
        icon={Package}
        contentClassName="p-0"
        actions={
          components.length > 0 ? (
            <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {components.length}{" "}
              {components.length === 1 ? "component" : "components"}
            </span>
          ) : null
        }
      >
        {components.length > 0 ? (
          <DetailTable
            rows={components}
            rowKey={(component) => component.id}
            columns={[
              {
                key: "sku",
                header: "SKU",
                width: "22%",
                className: "min-w-0",
                render: (component) => (
                  <Link
                    href={`/components/${component.id}`}
                    className="font-mono text-xs font-semibold text-primary hover:underline truncate block"
                  >
                    {component.sku}
                  </Link>
                ),
              },
              {
                key: "name",
                header: "Component",
                width: "38%",
                className: "min-w-0",
                render: (component) => (
                  <span className="text-sm text-foreground truncate block">
                    {component.name}
                  </span>
                ),
              },
              {
                key: "manufacturerPartNumber",
                header: "Manufacturer Part Number",
                width: "26%",
                className: "min-w-0",
                render: (component) =>
                  component.manufacturerPartNumber ? (
                    <span
                      className="font-mono text-xs text-foreground truncate block"
                      title={component.manufacturerPartNumber}
                    >
                      {component.manufacturerPartNumber}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  ),
              },
              {
                key: "status",
                header: "Status",
                width: "14%",
                className: "whitespace-nowrap",
                render: (component) => (
                  <RecordStatusBadge isActive={component.isActive} />
                ),
              },
            ]}
          />
        ) : (
          <p className="px-6 py-5 text-xs text-muted-foreground">
            No inventory components reference this manufacturer yet.
          </p>
        )}
      </SectionCard>

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Manufacturer"
        description={`Update the manufacturer record "${manufacturer.code}" used across sourced components.`}
        size="sm"
      >
        <ManufacturerForm
          initialData={manufacturer}
          onSuccess={(updated) => {
            setManufacturer(updated);
            setIsEditOpen(false);
            setToastMessage(
              `Manufacturer "${updated.code}" updated successfully.`,
            );
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Manufacturer"
        description={`Are you sure you want to delete manufacturer "${manufacturer.code}" (${manufacturer.name})? This action cannot be undone.`}
        confirmText="Delete Manufacturer"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
