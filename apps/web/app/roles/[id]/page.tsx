"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Shield, ArrowLeft, CheckCircle2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
        breadcrumbs={[
          { label: "Roles", href: "/roles" },
          { label: roleInfo.name },
        ]}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Role Type"
          value={roleInfo.isSystem ? "System Defined" : "Custom Policy"}
          subtitle={roleInfo.isSystem ? "Protected role" : "Editable role"}
          icon={Lock}
        />
        <StatCard
          title="Granted Permissions"
          value={
            isFullAccess ? "Full Access (*)" : roleInfo.permissions?.length || 0
          }
          subtitle="Authorized actions"
          icon={Shield}
        />
        <StatCard
          title="Assigned Users"
          value={assignedUsers.length}
          subtitle="Users with this role"
          icon={Users}
        />
        <StatCard
          title="Created Date"
          value={new Date(roleInfo.createdAt).toLocaleDateString()}
          subtitle="Policy creation date"
          icon={Shield}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Granted Permissions */}
        <div className="lg:col-span-2 space-y-4 bg-card border border-border rounded-xl p-6 shadow-xs">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">
              Permission Set Matrix ({roleInfo.permissions?.length || 0})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actions permitted for users assigned to{" "}
              <span className="font-semibold text-foreground">
                {roleInfo.name}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {isFullAccess ? (
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-700 dark:text-purple-300 font-bold col-span-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-500" />
                <span>
                  FULL SYSTEM ADMINISTRATOR ACCESS (*) — All permissions
                  granted.
                </span>
              </div>
            ) : roleInfo.permissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No permissions configured for this role.
              </p>
            ) : (
              roleInfo.permissions.map((perm) => (
                <div
                  key={perm}
                  className="p-2.5 bg-muted/20 border border-border rounded-lg flex items-center gap-2 text-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                  <span className="font-mono text-foreground font-semibold">
                    {perm}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Assigned Users Directory */}
        <div className="space-y-4 bg-card border border-border rounded-xl p-6 shadow-xs">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">
              Assigned Accounts ({assignedUsers.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Users operating under this role policy
            </p>
          </div>

          <div className="space-y-2">
            {assignedUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No users currently assigned to this role.
              </p>
            ) : (
              assignedUsers.map((u) => (
                <Link
                  key={u.id}
                  href={`/users/${u.id}`}
                  className="p-3 bg-muted/20 border border-border rounded-lg block hover:border-primary/50 transition-colors text-xs space-y-0.5"
                >
                  <p className="font-bold text-foreground">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {u.email}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
