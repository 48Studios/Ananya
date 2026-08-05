"use client";

import * as React from "react";
import { Filter, Calendar, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";

export interface FilterState {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  componentId?: string;
  supplierId?: string;
  categoryId?: string;
  status?: string;
  search?: string;
}

export interface ReportFiltersProps {
  filters: FilterState;
  onChange: (newFilters: FilterState) => void;
  showStatusFilter?: boolean;
  statusOptions?: { label: string; value: string }[];
}

export function ReportFilters({
  filters,
  onChange,
  showStatusFilter = false,
  statusOptions = [],
}: ReportFiltersProps) {
  const handleReset = () => {
    onChange({
      startDate: "",
      endDate: "",
      locationId: "",
      componentId: "",
      supplierId: "",
      categoryId: "",
      status: "",
      search: "",
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Report Filters</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset Filters
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Start Date */}
        <Field>
          <FieldLabel className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Start Date
          </FieldLabel>
          <Input
            type="date"
            value={filters.startDate || ""}
            onChange={(e) =>
              onChange({ ...filters, startDate: e.target.value })
            }
            className="h-8 text-xs"
          />
        </Field>

        {/* End Date */}
        <Field>
          <FieldLabel className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> End Date
          </FieldLabel>
          <Input
            type="date"
            value={filters.endDate || ""}
            onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
            className="h-8 text-xs"
          />
        </Field>

        {/* Status Filter */}
        {showStatusFilter && (
          <Field>
            <FieldLabel className="text-[11px] text-muted-foreground">
              Status
            </FieldLabel>
            <Select
              value={filters.status ?? "ALL"}
              onValueChange={(val) =>
                onChange({
                  ...filters,
                  status: !val || val === "ALL" ? "" : val,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Search */}
        <Field>
          <FieldLabel className="text-[11px] text-muted-foreground">
            Search Term
          </FieldLabel>
          <Input
            type="text"
            placeholder="Search code, name, ref..."
            value={filters.search || ""}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="h-8 text-xs"
          />
        </Field>
      </div>
    </div>
  );
}
