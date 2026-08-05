"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-card border border-border rounded-xl">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
