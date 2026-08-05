"use client";

import React, { useState, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";

interface SidebarFlyoutProps {
  isOpen: boolean;
  triggerRect: DOMRect | null;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function SidebarFlyout({
  isOpen,
  triggerRect,
  children,
  onMouseEnter,
  onMouseLeave,
}: SidebarFlyoutProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen || !triggerRect) return null;

  // Calculate position: right of collapsed sidebar trigger (top aligned)
  const style: React.CSSProperties = {
    position: "fixed",
    top: `${triggerRect.top}px`,
    left: `${triggerRect.right + 8}px`,
    zIndex: 9999,
  };

  return createPortal(
    <div
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="animate-in fade-in-0 duration-150"
    >
      {children}
    </div>,
    document.body,
  );
}
