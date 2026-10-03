"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";

export interface RevisionConflictInfo {
  type: "REVISION_CONFLICT";
  currentRevision: number;
  expectedRevision: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface PublishedConflictInfo {
  type: "PUBLISHED_LAYOUT_ALREADY_EXISTS";
  parentLocationId: string;
  existingLayoutId: string;
  existingLayoutCode: string;
}

export interface OwnershipConflictInfo {
  type: "SPATIAL_NODE_OWNERSHIP_CONFLICT";
  conflictingNodes: Array<{
    nodeId: string;
    locationId: string;
    existingSource: string;
    existingOwnerId: string | null;
  }>;
}

export interface InactiveParentInfo {
  type: "INACTIVE_LAYOUT_PARENT";
  parentLocationId: string;
}

export type LayoutConflictInfo =
  | RevisionConflictInfo
  | PublishedConflictInfo
  | OwnershipConflictInfo
  | InactiveParentInfo;

export interface LayoutConflictDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: LayoutConflictInfo | null;
  isResolving: boolean;
  onReloadServer?: () => Promise<void>;
  onForceOverwrite?: (serverRevision: number) => Promise<void>;
  onConfirmOwnershipOverwrite?: () => Promise<void>;
  onSwitchToConflictingLayout?: (layoutId: string) => void;
}

export function LayoutConflictDialog({
  isOpen,
  onClose,
  conflict,
  isResolving,
  onReloadServer,
  onForceOverwrite,
  onConfirmOwnershipOverwrite,
  onSwitchToConflictingLayout,
}: LayoutConflictDialogProps) {
  if (!isOpen || !conflict) return null;

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isResolving) {
          onClose();
        }
      }}
      title={
        conflict.type === "REVISION_CONFLICT"
          ? "Concurrent Revision Conflict"
          : conflict.type === "PUBLISHED_LAYOUT_ALREADY_EXISTS"
            ? "Published Layout Conflict"
            : conflict.type === "INACTIVE_LAYOUT_PARENT"
              ? "Parent Location Inactive"
              : "Spatial Node Ownership Conflict"
      }
      description={
        conflict.type === "REVISION_CONFLICT"
          ? "Another operator updated this layout while you were editing."
          : conflict.type === "PUBLISHED_LAYOUT_ALREADY_EXISTS"
            ? "A published layout already exists for this parent container."
            : conflict.type === "INACTIVE_LAYOUT_PARENT"
              ? "Publication is blocked because the parent container is inactive."
              : "Some mapped locations have existing manual or CAD spatial geometry."
      }
      size="md"
      closeDisabled={isResolving}
    >
      <DialogShellBody className="space-y-4">
        {conflict.type === "REVISION_CONFLICT" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Server revision has advanced
                </p>
                <p>
                  Your changes are based on revision{" "}
                  <strong>{conflict.expectedRevision}</strong>, but the layout is
                  currently at revision <strong>{conflict.currentRevision}</strong> on
                  the server.
                </p>
                {conflict.updatedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    Last updated: {new Date(conflict.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              To avoid silently overwriting another user&apos;s work, choose how you want to
              proceed:
            </p>

            <ul className="text-xs space-y-1.5 list-disc list-inside text-muted-foreground pl-1">
              <li>
                <strong className="text-foreground">Reload Server Version:</strong>{" "}
                Discard your uncommitted changes and load the latest configuration.
              </li>
              <li>
                <strong className="text-foreground">Force Overwrite:</strong> Commit
                your local changes on top of revision {conflict.currentRevision}.
              </li>
            </ul>
          </div>
        )}

        {conflict.type === "PUBLISHED_LAYOUT_ALREADY_EXISTS" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 flex items-start gap-3 text-xs text-destructive">
              <ShieldAlert className="size-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Only one layout can be PUBLISHED per parent container
                </p>
                <p>
                  Layout <strong>{conflict.existingLayoutCode}</strong> (
                  <code className="text-[11px]">{conflict.existingLayoutId}</code>
                  ) is currently published for this physical container.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  In accordance with RFC-0068, you must explicitly archive the existing
                  published layout before publishing a new one.
                </p>
              </div>
            </div>
          </div>
        )}

        {conflict.type === "INACTIVE_LAYOUT_PARENT" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Reactivate the parent container to publish
                </p>
                <p>
                  This layout&apos;s parent container is inactive, so it cannot
                  be published yet. Your draft, mappings, unsaved edits, and
                  revision history are preserved — nothing was changed.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Parent location ID:{" "}
                  <code className="text-[11px]">{conflict.parentLocationId}</code>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Reactivate the location in Storage Locations &amp; Bins, then
                  publish again from this workspace.
                </p>
              </div>
            </div>
          </div>
        )}

        {conflict.type === "SPATIAL_NODE_OWNERSHIP_CONFLICT" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Manual or CAD geometry detected
                </p>
                <p>
                  {conflict.conflictingNodes.length} mapped{" "}
                  {conflict.conflictingNodes.length === 1 ? "location has" : "locations have"}{" "}
                  existing spatial nodes authored outside the Inventory Builder.
                </p>
                <p className="text-[11px]">
                  Confirming will overwrite the nodes with parametric layout geometry,
                  while safely backing up the original coordinates for lossless restoration
                  if unmapped.
                </p>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto rounded-md border border-border text-xs divide-y divide-border">
              {conflict.conflictingNodes.map((n) => (
                <div
                  key={n.nodeId}
                  className="px-3 py-2 flex items-center justify-between"
                >
                  <span className="font-mono text-[11px] text-foreground">
                    {n.locationId}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Source: {n.existingSource}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isResolving}>
          Close
        </DialogShellCancelButton>

        {conflict.type === "REVISION_CONFLICT" && (
          <>
            {onReloadServer && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await onReloadServer();
                  onClose();
                }}
                disabled={isResolving}
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Reload Server Version
              </Button>
            )}
            {onForceOverwrite && (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await onForceOverwrite(conflict.currentRevision);
                  onClose();
                }}
                disabled={isResolving}
              >
                Force Overwrite
              </Button>
            )}
          </>
        )}

        {conflict.type === "PUBLISHED_LAYOUT_ALREADY_EXISTS" &&
          onSwitchToConflictingLayout && (
            <Button
              size="sm"
              onClick={() => {
                onSwitchToConflictingLayout(conflict.existingLayoutId);
                onClose();
              }}
            >
              Switch to Conflicting Layout
            </Button>
          )}

        {conflict.type === "SPATIAL_NODE_OWNERSHIP_CONFLICT" &&
          onConfirmOwnershipOverwrite && (
            <Button
              variant="default"
              size="sm"
              onClick={async () => {
                await onConfirmOwnershipOverwrite();
                onClose();
              }}
              disabled={isResolving}
            >
              <CheckCircle2 className="mr-1.5 size-3.5" />
              Authorize Overwrite & Publish
            </Button>
          )}
      </DialogShellFooter>
    </DialogShell>
  );
}
