"use client";

import * as React from "react";

export function PwaRegister() {
  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !(
        window.isSecureContext ||
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
      )
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
      })
      .catch((error) => {
        console.debug("ServiceWorker registration skipped or failed:", error);
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && registration) {
        registration.update().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
