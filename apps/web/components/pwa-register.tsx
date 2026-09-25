"use client";

import * as React from "react";

export function PwaRegister() {
  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" || window.location.hostname === "localhost")
    ) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.debug("ServiceWorker registration skipped or failed:", error);
      });
    }
  }, []);

  return null;
}
