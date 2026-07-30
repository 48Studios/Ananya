'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit3, Trash2, MapPin, Layers, Calendar, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { LocationForm } from '@/components/locations/location-form'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

const kindBadgeColors: Record<string, string> = {
  warehouse: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  aisle: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
  rack: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  shelf: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  bin: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
}

export default function ViewLocationPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [location, setLocation] = React.useState<LocationDto | null>(null)
  const [allLocations, setAllLocations] = React.useState<LocationDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
  const [deleteLoading, setDeleteLoading] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const fetchData = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [data, list] = await Promise.all([
        locationsApi.getById(id),
        locationsApi.getAll(),
      ])
      setLocation(data)
      setAllLocations(list)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load location details')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const parentLocation = React.useMemo(() => {
    if (!location?.parentId) return null
    return allLocations.find((l) => l.id === location.parentId) || null
  }, [location, allLocations])

  const childLocations = React.useMemo(() => {
    if (!location?.id) return []
    return allLocations.filter((l) => l.parentId === location.id)
  }, [location, allLocations])

  const handleDelete = async () => {
    if (!id) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await locationsApi.delete(id)
      router.push('/locations')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete location')
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading location details..." />
  }

  if (error || !location) {
    return (
      <ErrorState
        title="Location Not Found"
        message={error || 'The requested location does not exist.'}
        onRetry={fetchData}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={location.name}
        description={`Code: ${location.code}`}
        breadcrumbs={[
          { label: 'Locations', href: '/locations' },
          { label: location.code },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/locations')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteError(null)
                setIsDeleteOpen(true)
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </div>
        }
      />

      {/* Delete Error Notification */}
      {deleteError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {deleteError}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Location Code"
          value={location.code}
          subtitle={`Kind: ${location.kind.toUpperCase()}`}
          icon={MapPin}
        />
        <StatCard
          title="Parent Location"
          value={parentLocation ? parentLocation.code : 'Top Level'}
          subtitle={parentLocation ? parentLocation.name : 'No parent hierarchy'}
          icon={Layers}
        />
        <StatCard
          title="Sub-Locations"
          value={childLocations.length}
          subtitle={`${childLocations.length} child elements nested`}
          icon={Calendar}
        />
      </div>

      {/* Location Details Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
        <div>
          <h3 className="text-base font-semibold text-foreground">Location Information</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full record properties and status details.
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">ID</dt>
            <dd className="mt-1 font-mono text-xs text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
              {location.id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  location.isActive
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {location.isActive ? 'Active' : 'Inactive'}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Kind</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full capitalize ${
                  kindBadgeColors[location.kind.toLowerCase()] ||
                  'bg-muted text-muted-foreground border-border'
                }`}
              >
                {location.kind}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Parent Location</dt>
            <dd className="mt-1 text-foreground">
              {parentLocation ? (
                <Link
                  href={`/locations/${parentLocation.id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {parentLocation.code} ({parentLocation.name})
                </Link>
              ) : (
                <span className="text-muted-foreground italic text-xs">Top Level</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Created Date</dt>
            <dd className="mt-1 text-foreground">
              {new Date(location.createdAt).toLocaleString()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Updated Date</dt>
            <dd className="mt-1 text-foreground">
              {new Date(location.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>

        {/* Child Locations Listing if any */}
        {childLocations.length > 0 && (
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Child Locations ({childLocations.length})
            </h4>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {childLocations.map((child) => (
                <div
                  key={child.id}
                  className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded font-medium">
                      {child.code}
                    </span>
                    <span className="text-sm font-medium text-foreground">{child.name}</span>
                  </div>
                  <Link href={`/locations/${child.id}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Form Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">Edit Location</h2>
            </div>
            <LocationForm
              initialData={location}
              locations={allLocations}
              onSuccess={(updated) => {
                setLocation(updated)
                setIsEditOpen(false)
              }}
              onCancel={() => setIsEditOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Location"
        description={`Are you sure you want to delete location "${location.code}" (${location.name})? This action cannot be undone.`}
        confirmText="Delete Location"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  )
}
