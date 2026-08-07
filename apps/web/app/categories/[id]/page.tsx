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
  Layers,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { CategoryForm } from "@/components/categories/category-form";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

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
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete category");
      }
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
      {/* Page Header */}
      <PageHeader
        title={category.name}
        description={`Code: ${category.code}`}
        breadcrumbs={[
          { label: "Categories", href: "/categories" },
          { label: category.code },
        ]}
        actions={
          <div className="flex items-center gap-2">
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

      {/* Stat Cards Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Components"
          value={components.length}
          subtitle="Categorized catalog items"
          icon={Package}
        />
        <StatCard
          title="Active Components"
          value={activeComponentsCount}
          subtitle="Currently active inventory"
          icon={Package}
        />
        <StatCard
          title="Subcategories"
          value={childCategories.length}
          subtitle="Nested child categories"
          icon={FolderTree}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* General Information Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              General Information
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Category master record definition and parent hierarchy.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Category ID
              </dt>
              <dd className="mt-1 font-mono text-xs text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
                {category.id}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                    category.isActive
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {category.isActive ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Code
              </dt>
              <dd className="mt-1 font-mono text-xs font-semibold text-foreground uppercase">
                {category.code}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Name
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {category.name}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Description
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {category.description || "No description provided."}
              </dd>
            </div>
          </dl>

          {/* Audit Timestamps */}
          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Created: {new Date(category.createdAt).toLocaleString()}
            </span>
            <span>
              Updated: {new Date(category.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Hierarchy Card */}
        <div className="space-y-6">
          {/* Parent Category Tile */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Parent Category
              </h3>
              <Layers className="w-4 h-4 text-muted-foreground" />
            </div>

            {parentCategory ? (
              <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground uppercase">
                    {parentCategory.code}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {parentCategory.name}
                </p>
                <Link href={`/categories/${parentCategory.id}`}>
                  <Button
                    variant="link"
                    size="xs"
                    className="px-0 text-primary"
                  >
                    View Parent Category →
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Top-level root category (No parent category assigned).
              </p>
            )}
          </div>

          {/* Subcategories Tile */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Child Subcategories ({childCategories.length})
              </h3>
              <FolderTree className="w-4 h-4 text-muted-foreground" />
            </div>

            {childCategories.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {childCategories.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded uppercase font-medium mr-2">
                        {sub.code}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        {sub.name}
                      </span>
                    </div>
                    <Link href={`/categories/${sub.id}`}>
                      <Button variant="ghost" size="xs">
                        View
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No nested subcategories under this category.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Associated Components Listing */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Associated Inventory Components ({components.length})
        </h3>

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
                    View Component →
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No components currently assigned to this category.
          </p>
        )}
      </div>

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
