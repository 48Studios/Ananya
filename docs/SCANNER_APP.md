# Scanner App

The scanner is a **standalone surface at `/scan`**, installable on an iPhone Home
Screen as its own app. It is not a page inside the ERP: it renders no navigation
rail, sidebar, header or footer, and it never changes route. A scan resolves a
code and opens the ERP's own component-details modal over the camera.

```
iPhone Home Screen → Scanner app → Camera → QR detected
    → resolve → Component details modal → close → camera resumes
```

---

## Installing on an iPhone

1. Open **`https://<your-ananya-host>/scan`** in Safari.
2. Share → **Add to Home Screen**.
3. Launch it from the Home Screen. It opens in standalone mode (no browser
   chrome), in portrait, directly on the camera.

The manifest that drives this is served from `/scan/manifest.webmanifest`
(`start_url: /scan`, `display: standalone`, `orientation: portrait`), and the
route sets `apple-mobile-web-app-capable` plus a black-translucent status bar so
the camera feed runs under the status bar.

**The installed app is the scanner.** `scope` is the site root only so that a
re-authentication (`/login`) stays inside the installed app; the app's identity
is still `/scan` via `id`.

---

## HTTPS is required

Camera access requires a **secure context**. On iPhone, `navigator.mediaDevices`
does not exist at all over plain HTTP, so the scanner cannot open a camera and
says so ("Camera unavailable — … the scanner has to be served over HTTPS").

- Production: serve the web app over HTTPS (see `compose.prod.yml`).
- Local development: `http://localhost:3000` is treated as a secure context by
  Safari and Chrome, so the scanner works there. A LAN address such as
  `http://192.168.1.20:3000` is **not** secure, and the camera will not open on a
  phone — use a tunnel (ngrok, Cloudflare Tunnel) or a local certificate.

The first launch asks for camera permission. A denial is explained on screen
with a retry, never a blank view; permission can be restored per site in Safari's
settings (or iOS Settings → Safari → Camera).

---

## What a scan does

- Resolves the scanned value through the **existing** `GET /barcodes/lookup`
  endpoint — the same one the ERP's own scan dialog uses. A QR payload
  (`ANANYA:V1:COMPONENT:<id>`), a label URL captured by the phone's camera
  (`/scan?code=…`), a raw UUID, a component SKU, a location code and the other
  entity numbers all resolve there. No second identifier format exists.
- Opens the **existing** `ScannedEntityModal` (stock, storage location,
  description, label printing) with navigation disabled: no "Open Full Page", no
  route change, no new page. Closing it returns to a live camera.
- Shows a short error and resumes scanning when the code is unknown, unreadable,
  or the API cannot be reached.

`/scan?code=…` is also the URL the printed QR labels encode, so the same link
works from Safari without installing anything.

---

## Scan lifecycle

```
idle → scanning → processing → showing-details → scanning
                     ↓
                   error (message shown, camera keeps scanning)
```

- **One lookup per detection burst.** The camera reports the same code on every
  frame it is visible in; a synchronous in-flight lock makes that a single
  request.
- **Detection pauses** while a lookup is in flight and while the details modal is
  open. The stream itself stays open (closing the modal resumes decoding on the
  next frame instead of re-opening the camera).
- **The same code is only read again once it has left the frame.** Closing the
  modal with the label still under the lens does not reopen it — the operator can
  move straight to the next label.
- The stream, the decoder loop and its timers are released when the surface
  unmounts.

---

## iPhone layout

The surface fills the viewport (`fixed inset-0`, no scrolling) and every piece
of chrome is inset by `env(safe-area-inset-*)`, so the Dynamic Island, the notch
and the home indicator cannot cover a control. The scan reticle is a square of
`min(72vw, 72dvh)` capped at 22rem, and the decoder reads exactly that box —
mapping the reticle onto the frame accounts for the preview's `object-cover`
crop — with a throttled full-frame pass as a fallback.

---

## Implementation notes

- `apps/web/components/scanner/` — `scanner-app`, `scanner-camera`,
  `scanner-overlay`, `scanner-controls`, `scanner-details-modal`,
  `scan-result-handler`.
- `apps/web/lib/scanner.ts` — lifecycle, duplicate-detection gate,
  reticle→frame mapping and the failure copy (unit tested in `scanner.spec.ts`).
- Decoding uses the `jsqr` the ERP already ships (plus the browser's native
  `BarcodeDetector` where it exists, e.g. Android Chrome). No new dependency was
  added.
- `apps/web/lib/scanner-app-structure.spec.ts` pins the structural guarantees:
  no `router.push`/`window.location` in the scanner, the shared details modal
  with `allowNavigation={false}`, `/scan` kept out of the ERP shell, the PWA
  manifest, and the safe-area insets.

### Known limitations

- iOS Safari exposes no torch (flash) control, so the flash button only appears
  on devices/browsers that report one (Android Chrome). The camera-flip control
  is always available.
- The ERP shell's JavaScript is still part of the initial bundle because
  `DashboardLayout` lives in the root layout; the shell is not **rendered** for
  `/scan`, but it is downloaded. Splitting it out would mean moving every route
  into a route group — a repository-wide change, deliberately not made here.
- Camera streams on iOS are suspended when the app is backgrounded; playback is
  resumed on return, but a device that revokes the stream may need a retry.
