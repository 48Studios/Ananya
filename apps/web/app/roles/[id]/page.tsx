"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Shield,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Users,
  KeyRound,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailTable } from "@/components/ui/detail-table";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { rolesApi, RoleDto } from "@/lib/api/roles-api";
import { usersApi } from "@/lib/api/users-api";
import { UserProfileDto } from "@/lib/api/auth-api";

export default function RoleDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [roleInfo, setRoleInfo] = React.useState<RoleDto | null>(null);
  const [assignedUsers, setAssignedUsers] = React.useState<UserProfileDto[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [rData, uData] = await Promise.all([
        rolesApi.getById(id),
        usersApi.getAll({ roleId: id }).catch(() => []),
      ]);
      setRoleInfo(rData);
      setAssignedUsers(uData);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load role details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Fetching role specification..." />;
  }

  if (error || !roleInfo) {
    return (
      <ErrorState
        title="Role Policy Error"
        message={error || "Role definition not found."}
        onRetry={loadData}
      />
    );
  }

  const isFullAccess = roleInfo.permissions?.includes("*");

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={roleInfo.name}
        description={
          roleInfo.description || "System-configured access control role."
        }
        actions={
          <Link href="/roles">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Roles
            </Button>
          </Link>
        }
      />

      {/* KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard
          className="p-3.5"
          title="Role Type"
          value={roleInfo.isSystem ? "System Defined" : "Custom Policy"}
          subtitle={roleInfo.isSystem ? "Protected role" : "Editable role"}
          icon={Lock}
        />
        <StatCard
          className="p-3.5"
          title="Granted Permissions"
          value={
            isFullAccess ? "Full Access (*)" : roleInfo.permissions?.length || 0
          }
          subtitle="Authorized actions"
          icon={KeyRound}
        />
        <StatCard
          className="p-3.5"
          title="Assigned Users"
          value={assignedUsers.length}
          subtitle="Users with this role"
          icon={Users}
        />
        <StatCard
          className="p-3.5"
          title="Created Date"
          value={new Date(roleInfo.createdAt).toLocaleDateString()}
          subtitle="Policy creation date"
          icon={Calendar}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Granted Permissions */}
        <div className="lg:col-span-2">
          <SectionCard
            title={`Permission Set Matrix (${roleInfo.permissions?.length || 0})`}
            description={
              <>
                Actions permitted for users assigned to{" "}
                <span className="font-semibold text-foreground">
                  {roleInfo.name}
                </span>
              </>
            }
            icon={Shield}
            className="h-full"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {isFullAccess ? (
                <div className="col-span-2 flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 p-3 text-xs font-bold text-purple-700 dark:text-purple-300">
                  <CheckCircle2 className="h-4 w-4 text-purple-500" />
                  <span>
                    FULL SYSTEM ADMINISTRATOR ACCESS (*) — All permissions
                    granted.
                  </span>
                </div>
              ) : roleInfo.permissions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No permissions are configured for this role.
                </p>
              ) : (
                roleInfo.permissions.map((perm) => (
                  <div
                    key={perm}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5 text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
                    <span className="font-mono font-semibold text-foreground">
                      {perm}
                    </span>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        {/* Assigned Users Directory */}
        <SectionCard
          title={`Assigned Accounts (${assignedUsers.length})`}
          description="Users operating under this role policy"
          icon={Users}
          contentClassName="p-0"
          className="h-full"
        >
          {assignedUsers.length === 0 ? (
            <p className="px-6 py-5 text-xs text-muted-foreground">
              No users are assigned to this role yet.
            </p>
          ) : (
            <DetailTable
              rows={assignedUsers}
              rowKey={(user) => user.id}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  width: "45%",
                  className: "min-w-0",
                  render: (user) => (
                    <Link
                      href={`/users/${user.id}`}
                      className="text-sm font-medium text-primary hover:underline truncate block"
                    >
                      {user.firstName} {user.lastName}
                    </Link>
                  ),
                },
                {
                  key: "email",
                  header: "Email",
                  width: "55%",
                  className: "min-w-0",
                  render: (user) => (
                    <span
                      className="font-mono text-xs text-muted-foreground truncate block"
                      title={user.email}
                    >
                      {user.email}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
