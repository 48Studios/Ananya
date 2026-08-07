"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Users,
  UserPlus,
  Shield,
  UserCheck,
  UserX,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionGuard } from "@/lib/auth/auth-context";
import { usersApi } from "@/lib/api/users-api";
import { rolesApi, RoleDto } from "@/lib/api/roles-api";
import { UserProfileDto } from "@/lib/api/auth-api";

export default function UsersListPage() {
  const [userList, setUserList] = React.useState<UserProfileDto[]>([]);
  const [roles, setRoles] = React.useState<RoleDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Dialog State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserProfileDto | null>(
    null,
  );
  const [formEmail, setFormEmail] = React.useState("");
  const [formPassword, setFormPassword] = React.useState("");
  const [formFirstName, setFormFirstName] = React.useState("");
  const [formLastName, setFormLastName] = React.useState("");
  const [formDepartment, setFormDepartment] = React.useState("Operations");
  const [formRoleId, setFormRoleId] = React.useState("");
  const [formSubmitting, setFormSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uData, rData] = await Promise.all([
        usersApi.getAll(),
        rolesApi.getAll(),
      ]);
      setUserList(uData);
      setRoles(rData);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load user accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormEmail("");
    setFormPassword("");
    setFormFirstName("");
    setFormLastName("");
    setFormDepartment("Operations");
    setFormRoleId(roles[0]?.id || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = React.useCallback((u: UserProfileDto) => {
    setEditingUser(u);
    setFormEmail(u.email);
    setFormPassword("");
    setFormFirstName(u.firstName);
    setFormLastName(u.lastName);
    setFormDepartment(u.department || "");
    setFormRoleId(u.roleId || "");
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, {
          firstName: formFirstName,
          lastName: formLastName,
          department: formDepartment,
          roleId: formRoleId,
        });
      } else {
        await usersApi.create({
          email: formEmail,
          password: formPassword,
          firstName: formFirstName,
          lastName: formLastName,
          department: formDepartment,
          roleId: formRoleId,
        });
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) setFormError(err.message);
      else setFormError("Failed to save user.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = React.useCallback(
    async (u: UserProfileDto) => {
      try {
        if (u.status === "ACTIVE") {
          await usersApi.disable(u.id);
        } else {
          await usersApi.activate(u.id);
        }
        await loadData();
      } catch {
        // Ignore
      }
    },
    [loadData],
  );

  const columns = React.useMemo<ColumnDef<UserProfileDto>[]>(
    () => [
      {
        accessorKey: "name",
        header: "User Name",
        cell: ({ row }) => (
          <Link
            href={`/users/${row.original.id}`}
            className="font-semibold text-xs text-foreground hover:text-primary flex items-center gap-1.5"
          >
            {row.original.firstName} {row.original.lastName}
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: "email",
        header: "Email Address",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: "roleName",
        header: "Role",
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">
            {row.original.roleName}
          </span>
        ),
      },
      {
        accessorKey: "department",
        header: "Department",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.department || "General"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const isActive = row.original.status === "ACTIVE";
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
              }`}
            >
              {row.original.status}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PermissionGuard permission="Administration.Users">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleOpenEditModal(row.original)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleToggleStatus(row.original)}
                className={
                  row.original.status === "ACTIVE"
                    ? "text-rose-600 dark:text-rose-400 hover:text-rose-700"
                    : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                }
              >
                {row.original.status === "ACTIVE" ? "Disable" : "Activate"}
              </Button>
            </PermissionGuard>
          </div>
        ),
      },
    ],
    [handleOpenEditModal, handleToggleStatus],
  );

  if (loading) {
    return <LoadingState message="Loading system user directory..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Users Directory Error"
        message={error}
        onRetry={loadData}
      />
    );
  }

  const activeCount = userList.filter((u) => u.status === "ACTIVE").length;
  const disabledCount = userList.filter((u) => u.status === "DISABLED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="User Accounts Management"
        description="Centralized user identity, role assignments, and account status controls."
        actions={
          <PermissionGuard permission="Administration.Users">
            <Button size="sm" onClick={handleOpenCreateModal}>
              <UserPlus className="w-4 h-4 mr-1.5" />
              Create New User
            </Button>
          </PermissionGuard>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total User Accounts"
          value={userList.length}
          subtitle="Registered platform identities"
          icon={Users}
        />
        <StatCard
          title="Active Users"
          value={activeCount}
          subtitle="Permitted to authenticate"
          icon={UserCheck}
        />
        <StatCard
          title="Disabled Accounts"
          value={disabledCount}
          subtitle="Authentication locked"
          icon={UserX}
        />
        <StatCard
          title="Configured Roles"
          value={roles.length}
          subtitle="System & custom role policies"
          icon={Shield}
        />
      </div>

      {/* Users DataTable */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          User Directory ({userList.length} accounts)
        </h3>
        <EntityDataTable
          columns={columns}
          data={userList}
          searchKey="name"
          searchPlaceholder="Search user name, email or department..."
          loading={loading}
          emptyTitle="No users found"
          emptyMessage="No user accounts match the search query."
        />
      </div>

      <DialogShell
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={editingUser ? "Edit User Account" : "Create New User Account"}
        description={
          editingUser
            ? "Update user identity, department, and role assignment using the standard administration dialog layout."
            : "Create a new user account with consistent dialog structure and footer actions."
        }
        size="sm"
      >
        <form onSubmit={handleSaveUser} className="flex min-h-0 flex-1 flex-col">
          <DialogShellBody className="space-y-3">
            {formError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="user-firstname">First Name</FieldLabel>
                <Input
                  id="user-firstname"
                  type="text"
                  required
                  value={formFirstName}
                  onChange={(e) => setFormFirstName(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="user-lastname">Last Name</FieldLabel>
                <Input
                  id="user-lastname"
                  type="text"
                  required
                  value={formLastName}
                  onChange={(e) => setFormLastName(e.target.value)}
                />
              </Field>
            </div>

            {!editingUser && (
              <>
                <Field>
                  <FieldLabel htmlFor="user-email">Work Email</FieldLabel>
                  <Input
                    id="user-email"
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="font-mono"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="user-password">Password</FieldLabel>
                  <Input
                    id="user-password"
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="user-dept">Department</FieldLabel>
                <Input
                  id="user-dept"
                  type="text"
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="user-role">Assigned Role</FieldLabel>
                <Select
                  value={formRoleId || "NONE"}
                  onValueChange={(val) =>
                    setFormRoleId(!val || val === "NONE" ? "" : val)
                  }
                >
                  <SelectTrigger id="user-role">
                    <SelectValue placeholder="No Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Role</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
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
              {editingUser ? "Save User" : "Create User"}
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>
    </div>
  );
}
