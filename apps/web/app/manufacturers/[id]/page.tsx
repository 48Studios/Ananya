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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ManufacturerForm } from "@/components/manufacturers/manufacturer-form";
import {
  manufacturersApi,
  type ManufacturerDto,
} from "@/lib/api/manufacturers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

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
      {/* Page Header */}
      <PageHeader
        title={manufacturer.name}
        description={`Code: ${manufacturer.code}`}
        breadcrumbs={[
          { label: "Manufacturers", href: "/manufacturers" },
          { label: manufacturer.code },
        ]}
        actions={
          <div className="flex items-center gap-2">
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

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Components"
          value={components.length}
          subtitle="Catalog parts produced"
          icon={Package}
        />
        <StatCard
          title="Active Components"
          value={activeComponentsCount}
          subtitle="Active in inventory"
          icon={Factory}
        />
        <StatCard
          title="Archived Components"
          value={inactiveComponentsCount}
          subtitle="Inactive catalog parts"
          icon={Calendar}
        />
      </div>

      {/* General Information Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            General Information
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Master record parameters and active status.
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Manufacturer ID
            </dt>
            <dd className="mt-1 font-mono text-xs text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
              {manufacturer.id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  manufacturer.isActive
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {manufacturer.isActive ? "Active" : "Inactive"}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Code</dt>
            <dd className="mt-1 font-mono text-xs font-semibold text-foreground uppercase">
              {manufacturer.code}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Name</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {manufacturer.name}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Created Date
            </dt>
            <dd className="mt-1 text-foreground">
              {new Date(manufacturer.createdAt).toLocaleString()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Updated Date
            </dt>
            <dd className="mt-1 text-foreground">
              {new Date(manufacturer.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>

        {/* Associated Components Listing */}
        <div className="pt-4 border-t border-border space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Associated Components ({components.length})
          </h4>

          {components.length > 0 ? (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {components.map((comp) => (
                <div
                  key={comp.id}
                  className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded font-medium">
                      {comp.sku}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {comp.name}
                    </span>
                  </div>
                  <Link href={`/components/${comp.id}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No inventory components currently reference this manufacturer.
            </p>
          )}
        </div>
      </div>

      {/* Edit Form Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                Edit Manufacturer
              </h2>
            </div>
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
          </div>
        </div>
      )}

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
