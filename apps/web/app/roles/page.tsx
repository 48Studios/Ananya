"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Shield,
  ShieldPlus,
  Lock,
  ExternalLink,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionGuard } from "@/lib/auth/auth-context";
import { rolesApi, RoleDto } from "@/lib/api/roles-api";
import { authApi, PermissionGroup } from "@/lib/api/auth-api";

export default function RolesListPage() {
  const [roleList, setRoleList] = React.useState<RoleDto[]>([]);
  const [permGroups, setPermGroups] = React.useState<PermissionGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Dialog State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<RoleDto | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formDescription, setFormDescription] = React.useState("");
  const [selectedPermissions, setSelectedPermissions] = React.useState<
    string[]
  >([]);
  const [formSubmitting, setFormSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rData, meData] = await Promise.all([
        rolesApi.getAll(),
        authApi.getMe().catch(() => null),
      ]);
      setRoleList(rData);
      if (meData?.permissionGroups) {
        setPermGroups(meData.permissionGroups);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load system roles.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setFormName("");
    setFormDescription("");
    setSelectedPermissions([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = React.useCallback((r: RoleDto) => {
    setEditingRole(r);
    setFormName(r.name);
    setFormDescription(r.description || "");
    setSelectedPermissions(r.permissions || []);
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const handleTogglePermission = (code: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, {
          name: editingRole.isSystem ? undefined : formName,
          description: formDescription,
          permissions: selectedPermissions,
        });
      } else {
        await rolesApi.create({
          name: formName,
          description: formDescription,
          permissions: selectedPermissions,
        });
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) setFormError(err.message);
      else setFormError("Failed to save role.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteRole = React.useCallback(
    async (id: string) => {
      try {
        await rolesApi.delete(id);
        await loadData();
      } catch {
        // Ignore
      }
    },
    [loadData],
  );

  const columns = React.useMemo<ColumnDef<RoleDto>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Role Name",
        cell: ({ row }) => (
          <Link
            href={`/roles/${row.original.id}`}
            className="font-semibold text-xs text-foreground hover:text-primary flex items-center gap-1.5"
          >
            {row.original.name}
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.description || "No description provided."}
          </span>
        ),
      },
      {
        accessorKey: "isSystem",
        header: "Role Type",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${
              row.original.isSystem
                ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
            }`}
          >
            {row.original.isSystem ? "System Defined" : "Custom Policy"}
          </span>
        ),
      },
      {
        accessorKey: "permissions",
        header: "Permissions Count",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground">
            {row.original.permissions?.includes("*")
              ? "All Permissions (*)"
              : `${row.original.permissions?.length || 0} permissions`}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PermissionGuard permission="Administration.Roles">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleOpenEditModal(row.original)}
              >
                Edit
              </Button>
              {!row.original.isSystem && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleDeleteRole(row.original.id)}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </PermissionGuard>
          </div>
        ),
      },
    ],
    [handleOpenEditModal, handleDeleteRole],
  );

  if (loading) {
    return <LoadingState message="Loading system roles and permissions..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Roles Management Error"
        message={error}
        onRetry={loadData}
      />
    );
  }

  const systemCount = roleList.filter((r) => r.isSystem).length;
  const customCount = roleList.filter((r) => !r.isSystem).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Role & Permission Management"
        description="Role-based access control policies, granular permissions matrix, and custom role definitions."
        actions={
          <PermissionGuard permission="Administration.Roles">
            <Button size="sm" onClick={handleOpenCreateModal}>
              <ShieldPlus className="w-4 h-4 mr-1.5" />
              Create Custom Role
            </Button>
          </PermissionGuard>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total System Roles"
          value={roleList.length}
          subtitle="Configured access policies"
          icon={Shield}
        />
        <StatCard
          title="System-Defined Roles"
          value={systemCount}
          subtitle="Protected ERP roles"
          icon={Lock}
        />
        <StatCard
          title="Custom Roles"
          value={customCount}
          subtitle="Organization specific"
          icon={ShieldPlus}
        />
        <StatCard
          title="Permission Groups"
          value={permGroups.length || 7}
          subtitle="Granular functional domains"
          icon={Shield}
        />
      </div>

      {/* Roles DataTable */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Configured Roles Directory ({roleList.length} roles)
        </h3>
        <EntityDataTable
          columns={columns}
          data={roleList}
          searchKey="name"
          searchPlaceholder="Search role name or description..."
          loading={loading}
          emptyTitle="No roles found"
          emptyMessage="No configured roles match the search criteria."
        />
      </div>

      <DialogShell
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          editingRole ? `Edit Role: ${editingRole.name}` : "Create Custom Role"
        }
        description={
          editingRole
            ? "Update role metadata and granted permissions using the standard administration dialog layout."
            : "Create a custom role with a consistent dialog header, scrollable permission matrix, and shared footer actions."
        }
        size="lg"
      >
        <form
          onSubmit={handleSaveRole}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogShellBody className="space-y-4 text-xs">
            {formError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="font-medium text-foreground">Role Name</label>
                <input
                  type="text"
                  required
                  disabled={editingRole?.isSystem}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-foreground outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">
                  Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-foreground outline-none"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block font-semibold text-foreground">
                Select Granted Permissions ({selectedPermissions.length}{" "}
                selected)
              </label>

              {permGroups.map((group) => (
                <div
                  key={group.category}
                  className="space-y-2 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {group.category} Permissions
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.permissions.map((p) => {
                      const code = typeof p === "string" ? p : p.code;
                      const name = typeof p === "string" ? p : p.name;
                      const description =
                        typeof p === "string" ? "" : p.description;
                      const isChecked = selectedPermissions.includes(code);
                      return (
                        <label
                          key={code}
                          className="flex cursor-pointer items-start gap-2 rounded p-1.5 transition-colors hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePermission(code)}
                            className="mt-0.5 rounded border-border"
                          />
                          <div>
                            <p className="font-semibold text-foreground">
                              {name}
                            </p>
                            {description && (
                              <p className="text-[10px] text-muted-foreground">
                                {description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton
              disabled={formSubmitting}
              onClick={() => setIsModalOpen(false)}
            />
            <Button size="sm" type="submit" disabled={formSubmitting}>
              {formSubmitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editingRole ? "Save Changes" : "Create Role"}
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>
    </div>
  );
}
