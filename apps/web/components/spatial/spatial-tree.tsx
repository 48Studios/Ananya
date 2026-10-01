"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  MapPin,
  Warehouse,
  Box,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LocationTreeNode } from "@/lib/spatial/spatial-hierarchy";

export interface SpatialTreeProps {
  tree: LocationTreeNode[];
  selectedLocationId: string | null;
  onSelectLocation: (locationId: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (locationId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  className?: string;
}

export function SpatialTree({
  tree,
  selectedLocationId,
  onSelectLocation,
  expandedIds,
  onToggleExpand,
  searchQuery,
  onSearchChange,
  onExpandAll,
  onCollapseAll,
  className,
}: SpatialTreeProps) {
  const renderTreeNode = (node: LocationTreeNode, level = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedLocationId === node.id;
    const hasChildren = node.children.length > 0;

    const getNodeIcon = () => {
      const k = node.kind.toLowerCase();
      if (k === "warehouse" || k === "room") {
        return <Warehouse className="size-3.5 shrink-0 text-blue-500" />;
      }
      if (k === "aisle" || k === "rack") {
        return <Layers className="size-3.5 shrink-0 text-indigo-500" />;
      }
      if (k === "cabinet" || k === "shelf") {
        return <Box className="size-3.5 shrink-0 text-violet-500" />;
      }
      if (k === "drawer" || k === "bin" || k === "compartment") {
        return <MapPin className="size-3.5 shrink-0 text-emerald-500" />;
      }
      return <Folder className="size-3.5 shrink-0 text-muted-foreground" />;
    };

    const renderStatusBadge = () => {
      if (node.status === "MAPPED") {
        return (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
            title="Location has a direct SpatialNode mapping"
          >
            <CheckCircle2 className="size-2.5" />
            <span>Mapped</span>
          </span>
        );
      }

      if (node.status === "PARTIAL") {
        return (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0"
            title={`Mapped, but ${node.totalChildrenCount - node.mappedChildrenCount} child locations unmapped`}
          >
            <span className="font-mono text-[9px]">◐</span>
            <span>
              {node.mappedChildrenCount}/{node.totalChildrenCount}
            </span>
          </span>
        );
      }

      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border shrink-0"
          title="No direct SpatialNode mapped for this location"
        >
          <AlertTriangle className="size-2.5 text-amber-500" />
          <span>Unmapped</span>
        </span>
      );
    };

    return (
      <div key={node.id} className="select-none">
        <div
          className={cn(
            "group flex items-center justify-between gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors text-xs",
            isSelected
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/60 text-foreground",
          )}
          style={{ paddingLeft: `${Math.max(level * 16 + 8, 8)}px` }}
          onClick={() => onSelectLocation(node.id)}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                className={cn(
                  "p-0.5 -ml-1 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0 transition-colors",
                  isSelected ? "text-primary-foreground" : "text-muted-foreground",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(node.id);
                }}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            {getNodeIcon()}

            <span
              className={cn(
                "font-mono font-bold tracking-tight truncate",
                isSelected ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {node.code}
            </span>

            <span
              className={cn(
                "truncate text-[11px]",
                isSelected
                  ? "text-primary-foreground/80 font-normal"
                  : "text-muted-foreground",
              )}
            >
              {node.name}
            </span>
          </div>

          <div className="shrink-0 pl-1">{renderStatusBadge()}</div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden",
        className,
      )}
    >
      {/* Search Header */}
      <div className="p-3 border-b border-border space-y-2 bg-muted/20">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search code or name..."
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
          <span>Location Hierarchy</span>
          <div className="flex items-center gap-2">
            {onExpandAll && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onExpandAll}
                className="h-5 px-1.5 text-[10px]"
              >
                Expand all
              </Button>
            )}
            {onCollapseAll && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onCollapseAll}
                className="h-5 px-1.5 text-[10px]"
              >
                Collapse all
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {tree.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground px-4">
            {searchQuery ? (
              <p>No locations match your search query &ldquo;{searchQuery}&rdquo;.</p>
            ) : (
              <p>No storage locations configured in the system.</p>
            )}
          </div>
        ) : (
          tree.map((rootNode) => renderTreeNode(rootNode, 0))
        )}
      </div>
    </div>
  );
}
