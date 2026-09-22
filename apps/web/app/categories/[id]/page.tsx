"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  ArrowLeft,
  FolderTree,
  Package,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DetailChip,
  DetailField,
  DetailFields,
  DetailMono,
  DetailMuted,
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
import { CategoryForm } from "@/components/categories/category-form";
import { CategoryAttributesManager } from "@/components/categories/category-attributes-manager";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

/**
 * One category, as a master-data record.
 *
 * Categories are hierarchical, so the page carries a dedicated hierarchy
 * section that reads parent → this category → subcategories in order. The
 * category's own fields stay in the information section, and its bound
 * attribute definitions live in the specifications section — a definition is
 * not a component value and is never presented as one.
 */
export default function ViewCategoryPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [category, setCategory] = React.useState<CategoryDto | null>(null);
  const [parentCategory, setParentCategory] =
    React.useState<CategoryDto | null>(null);
  const [childCategories, setChildCategories] = React.useState<CategoryDto[]>(
    [],
  );
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
      const [cat, allCats, allComps] = await Promise.all([
        categoriesApi.getById(id),
        categoriesApi.getAll().catch(() => []),
        componentsApi.getAll().catch(() => []),
      ]);
      setCategory(cat);
      setChildCategories(allCats.filter((c) => c.parentId === id));
      setComponents(allComps.filter((c) => c.categoryId === id));

      if (cat.parentId) {
        const parent = allCats.find((c) => c.id === cat.parentId);
        setParentCategory(parent || null);
      } else {
        setParentCategory(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load category details");
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

  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await categoriesApi.delete(id);
      router.push("/categories");
    } catch (err: unknown) {
      setIsDeleteOpen(false);
      let message = "Failed to delete category";
      if (err instanceof Error) {
        message =
          category && err.message.includes(id)
            ? err.message.replace(id, category.name || category.code)
            : err.message;
      }
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading category details..." />;
  }

  if (error || !category) {
    return (
      <ErrorState
        title="Category Not Found"
        message={error || "The requested category record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={category.name}
        description={`Code: ${category.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/categories")}
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
      <div className="space-y-3">
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
      </div>

      {/* Catalog Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          className="p-3.5"
          title="Total Components"
          value={components.length}
          subtitle="Categorized catalog items"
          icon={Package}
        />
        <StatCard
          className="p-3.5"
          title="Active Components"
          value={activeComponentsCount}
          subtitle="Currently active inventory"
          icon={Package}
        />
        <StatCard
          className="p-3.5"
          title="Subcategories"
          value={childCategories.length}
          subtitle="Nested child categories"
          icon={FolderTree}
        />
      </div>

      {/* Category Information */}
      <SectionCard
        title="Category Information"
        description="Category master record definition."
        icon={Info}
        contentClassName="p-0"
      >
        <DetailFields className="px-6 py-5">
          <DetailField label="Category ID">
            <DetailChip mono>{category.id}</DetailChip>
          </DetailField>

          <DetailField label="Status">
            <RecordStatusBadge isActive={category.isActive} />
          </DetailField>

          <DetailField label="Category Code">
            <DetailMono className="uppercase">{category.code}</DetailMono>
          </DetailField>

          <DetailField label="Category Name">
            <DetailText>{category.name}</DetailText>
          </DetailField>

          <DetailField
            label="Description"
            className="sm:col-span-2 lg:col-span-3 xl:col-span-4"
          >
            {category.description ? (
              <DetailText>{category.description}</DetailText>
            ) : (
              <DetailMuted>No description provided.</DetailMuted>
            )}
          </DetailField>
        </DetailFields>

        <SectionCardFooter>
          <RecordTimestamps
            createdAt={category.createdAt}
            updatedAt={category.updatedAt}
          />
        </SectionCardFooter>
      </SectionCard>

      {/* Category Hierarchy */}
      <SectionCard
        title="Category Hierarchy"
        description="Where this category sits in the category tree."
        icon={FolderTree}
        contentClassName="p-0"
      >
        <div className="divide-y divide-border">
          {/* Parent */}
          <div className="px-6 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              Parent category
            </p>
            {parentCategory ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <DetailChip mono className="uppercase">
                  {parentCategory.code}
                </DetailChip>
                <Link
                  href={`/categories/${parentCategory.id}`}
                  className="text-sm text-foreground hover:text-primary hover:underline"
                >
                  {parentCategory.name}
                </Link>
                <Link
                  href={`/categories/${parentCategory.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open parent →
                </Link>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                This is a top-level category with no parent assigned.
              </p>
            )}
          </div>

          {/* This category */}
          <div className="border-l-2 border-primary bg-muted/30 px-6 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              This category
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <DetailChip mono className="uppercase">
                {category.code}
              </DetailChip>
              <span className="text-sm font-semibold text-foreground">
                {category.name}
              </span>
              <RecordStatusBadge isActive={category.isActive} />
            </div>
          </div>

          {/* Children */}
          <div className="px-6 pt-4 pb-1">
            <p className="text-xs font-medium text-muted-foreground">
              Subcategories ({childCategories.length})
            </p>
            {childCategories.length === 0 ? (
              <p className="mt-1.5 pb-4 text-xs text-muted-foreground">
                No child categories exist yet.
              </p>
            ) : null}
          </div>
        </div>

        {childCategories.length > 0 ? (
          <ul className="divide-y divide-border border-t border-border">
            {childCategories.map((child) => (
              <li
                key={child.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 hover:bg-muted/20 transition-colors"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DetailChip mono className="uppercase">
                    {child.code}
                  </DetailChip>
                  <span className="text-sm text-foreground truncate">
                    {child.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <RecordStatusBadge isActive={child.isActive} />
                  <Link href={`/categories/${child.id}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      {/* Configured Specifications & Attributes */}
      <CategoryAttributesManager categoryId={id} categoryName={category.name} />

      {/* Associated Inventory Components */}
      <SectionCard
        title="Associated Inventory Components"
        description="Catalog parts assigned to this category."
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
                width: "52%",
                className: "min-w-0",
                render: (component) => (
                  <span className="text-sm text-foreground truncate block">
                    {component.name}
                  </span>
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
              {
                key: "actions",
                header: "",
                align: "right",
                width: "12%",
                render: (component) => (
                  <Link href={`/components/${component.id}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <p className="px-6 py-5 text-xs text-muted-foreground">
            No components are assigned to this category yet.
          </p>
        )}
      </SectionCard>

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Category"
        description={`Update the inventory category "${category.code}" with standardized master data fields.`}
        size="sm"
      >
        <CategoryForm
          initialData={category}
          onSuccess={(updated) => {
            setCategory(updated);
            setIsEditOpen(false);
            setToastMessage(`Category "${updated.code}" updated successfully.`);
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Category"
        description={`Are you sure you want to delete category "${category.code}" (${category.name})? This action cannot be undone.`}
        confirmText="Delete Category"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
