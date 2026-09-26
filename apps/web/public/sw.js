// Minimal Service Worker for PWA installability and offline readiness

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Offline — Ananya ERP</title>
  <style>
    body {
      background-color: #0f1012;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1.5rem;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      max-width: 24rem;
      border: 1px solid #27272a;
      border-radius: 0.5rem;
      padding: 2rem;
      background-color: #18181b;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; color: #f8fafc; }
    p { font-size: 0.875rem; color: #a1a1aa; margin: 0 0 1.5rem; line-height: 1.4; }
    button {
      background-color: #1e90ff;
      color: #ffffff;
      border: none;
      padding: 0.625rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
    }
    button:hover { background-color: #1c82e6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Offline</h1>
    <p>You are currently offline. Please check your connection to reconnect to Ananya ERP.</p>
    <button onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Only intercept standard HTTP/HTTPS schemes; ignore browser extensions (chrome-extension://, moz-extension://)
  if (!event.request.url.startsWith("http://") && !event.request.url.startsWith("https://")) {
    return;
  }

  // Only handle GET requests; mutations (POST/PUT/PATCH/DELETE) and streaming bodies pass directly to network
  if (event.request.method !== "GET") {
    return;
  }

  // Pass-through fetch handler satisfying PWA installability criteria
  // while ensuring dynamic ERP mutations and API responses remain fresh
  event.respondWith(
    fetch(event.request).catch((error) => {
      // If a full-page navigation fails because the user is offline, provide a friendly fallback page
      if (event.request.mode === "navigate") {
        return new Response(OFFLINE_HTML, {
          status: 503,
          statusText: "Service Unavailable (Offline)",
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
      return Promise.reject(error);
    })
  );
});
