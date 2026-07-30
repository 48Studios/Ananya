'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, X, Eye, Edit3, Trash2, FolderTree, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CategoryForm } from '@/components/categories/category-form'
import { categoriesApi, type CategoryDto } from '@/lib/api/categories-api'

export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<CategoryDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [editingCategory, setEditingCategory] = React.useState<CategoryDto | null>(null)
  const [deletingCategory, setDeletingCategory] = React.useState<CategoryDto | null>(null)
  const [deleteLoading, setDeleteLoading] = React.useState(false)
  const [toastMessage, setToastMessage] = React.useState<string | null>(null)
  const [apiAlert, setApiAlert] = React.useState<string | null>(null)

  const fetchCategories = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await categoriesApi.getAll()
      setCategories(data)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to fetch categories from API')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const categoryMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.code)
    }
    return map
  }, [categories])

  const rootCount = React.useMemo(
    () => categories.filter((c) => !c.parentId).length,
    [categories],
  )
  const subcategoryCount = React.useMemo(
    () => categories.filter((c) => Boolean(c.parentId)).length,
    [categories],
  )

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return
    setDeleteLoading(true)
    setApiAlert(null)
    try {
      await categoriesApi.delete(deletingCategory.id)
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id))
      setToastMessage(`Category "${deletingCategory.code}" deleted successfully.`)
      setTimeout(() => setToastMessage(null), 4000)
      setDeletingCategory(null)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message)
      } else {
        setApiAlert('Failed to delete category')
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = React.useMemo<ColumnDef<CategoryDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <Link
            href={`/categories/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Category Name',
        cell: ({ row }) => (
          <Link
            href={`/categories/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'parentId',
        header: 'Parent Category',
        cell: ({ row }) => {
          const parentId = row.original.parentId
          if (!parentId) return <span className="text-xs text-muted-foreground italic">Root</span>
          const parentCode = categoryMap.get(parentId)
          return parentCode ? (
            <Link
              href={`/categories/${parentId}`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground uppercase"
            >
              {parentCode}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Parent</span>
          )
        },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground truncate max-w-xs block">
            {row.original.description || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
              row.original.isActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {row.original.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/categories/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit category"
              onClick={() => {
                setEditingCategory(row.original)
                setIsFormOpen(true)
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete category"
              onClick={() => {
                setApiAlert(null)
                setDeletingCategory(row.original)
              }}
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [categoryMap],
  )

  const filterConfigs: FilterConfig[] = [
    {
      columnId: 'isActive',
      title: 'Status',
      options: [
        { label: 'Active', value: 'true' },
        { label: 'Inactive', value: 'false' },
      ],
    },
  ]

  const handleFormSuccess = (savedCategory: CategoryDto) => {
    if (editingCategory) {
      setCategories((prev) =>
        prev.map((c) => (c.id === savedCategory.id ? savedCategory : c)),
      )
      setToastMessage(`Category "${savedCategory.code}" updated successfully.`)
    } else {
      setCategories((prev) => [savedCategory, ...prev])
      setToastMessage(`Category "${savedCategory.code}" created successfully.`)
    }
    setIsFormOpen(false)
    setEditingCategory(null)
    setTimeout(() => setToastMessage(null), 4000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Categories Management"
        description="Hierarchical classification tree for inventory components and catalog parts."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingCategory(null)
              setIsFormOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Category
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Categories"
          value={categories.length}
          subtitle="Master classification nodes"
          icon={FolderTree}
        />
        <StatCard
          title="Root Categories"
          value={rootCount}
          subtitle="Top-level parent categories"
          icon={FolderTree}
        />
        <StatCard
          title="Subcategories"
          value={subcategoryCount}
          subtitle="Nested child categories"
          icon={FolderTree}
        />
      </div>

      {/* Notifications */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {apiAlert && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{apiAlert}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchCategories}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h2>
              <button
                onClick={() => {
                  setIsFormOpen(false)
                  setEditingCategory(null)
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CategoryForm
              initialData={editingCategory}
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setIsFormOpen(false)
                setEditingCategory(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingCategory)}
        title="Delete Category"
        description={`Are you sure you want to delete category "${deletingCategory?.code}" (${deletingCategory?.name})?`}
        confirmText="Delete Category"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingCategory(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={categories}
        searchKey="name"
        searchPlaceholder="Search categories by name..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No categories found"
        emptyMessage="Get started by creating your first inventory category."
      />
    </div>
  )
}
