"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface HeaderActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "icon";
  active?: boolean;
}

export const HeaderAction = React.forwardRef<
  HTMLButtonElement,
  HeaderActionProps
>(
  (
    {
      className,
      variant = "outline",
      size = "icon",
      active = false,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          // Canonical reference footprint (matches Search / Command Palette trigger)
          "inline-flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-medium transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 shrink-0",
          // Variants
          variant === "outline" &&
            "border border-border/60 bg-input/70 hover:bg-input text-muted-foreground hover:text-foreground shadow-xs",
          variant === "ghost" &&
            "border border-transparent bg-transparent hover:bg-input/80 text-muted-foreground hover:text-foreground",
          variant === "default" &&
            "border border-border/60 bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 shadow-xs",
          // Active state
          active && "bg-input text-foreground border-border/80",
          // Sizing
          size === "icon" && "w-8 min-w-[32px] px-0",
          size === "default" && "px-3 py-1.5",
          // Icon sizing constraint enforcement: all child icons size-3.5 (14px)
          "[&_svg]:size-3.5 [&_svg]:shrink-0",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

HeaderAction.displayName = "HeaderAction";
