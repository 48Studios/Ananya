"use client";

import * as React from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  chip?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  id?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search options...",
  emptyText = "No matching records found.",
  disabled = false,
  clearable = false,
  className,
  triggerClassName,
  contentClassName,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.chip && opt.chip.toLowerCase().includes(q)) ||
        opt.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between px-3 py-1.5 rounded-lg border border-input bg-transparent font-normal text-xs h-9 hover:bg-accent/50 transition-colors text-foreground select-none disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
          className,
        )}
      >
        <span className="truncate">
          {selectedOption ? (
            <span className="flex items-center gap-2">
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.chip && (
                <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] text-muted-foreground leading-none">
                  {selectedOption.chip}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {clearable && Boolean(value) && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange?.("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onValueChange?.("");
                }
              }}
              className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </div>
      </PopoverTrigger>

      <PopoverContent
        className={cn("w-[320px] p-2 space-y-2 text-xs", contentClassName)}
        align="start"
      >
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8"
            autoFocus
          />
        </div>

        <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
          {clearable && Boolean(value) && (
            <button
              type="button"
              onClick={() => {
                onValueChange?.("");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive italic border-b border-border/50 mb-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>None (Clear selection)</span>
            </button>
          )}

          {filteredOptions.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onValueChange?.(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors text-xs cursor-pointer",
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent hover:text-accent-foreground text-foreground",
                    opt.disabled &&
                      "opacity-50 pointer-events-none cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{opt.label}</span>
                    {opt.chip && (
                      <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] text-muted-foreground leading-none shrink-0">
                        {opt.chip}
                      </span>
                    )}
                    {opt.sublabel && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 shrink-0 ml-1" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
