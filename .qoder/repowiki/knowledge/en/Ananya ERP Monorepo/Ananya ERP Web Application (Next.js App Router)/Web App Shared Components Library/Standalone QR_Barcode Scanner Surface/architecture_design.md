The module composes one top-level `ScannerApp` (the `/scan` route) from four focused sub-components plus one React hook:
- `scanner-app.tsx` — orchestrates deep-link `?code=` resolution, camera lifecycle, state captions, safe-area chrome, and the failure banner; owns the viewport layout.
- `scan-result-handler.ts` — exports `useScanResultHandler`, the single source of truth for `ScannerState` (`idle`/`scanning`/`processing`/`showing-details`/`error`) and implements the "one lookup per code" gate using refs for in-flight locks, suppression windows, and timers.
- `scanner-camera.tsx` — owns `getUserMedia`, the decode loop (50 ms frame cadence), native `BarcodeDetector` fallback to jsQR, reticle-to-video-pixel mapping via `displayRectToVideoCrop`, torch/flip controls, and status callbacks.
- `scanner-overlay.tsx` — draws the square reticle whose DOM box is measured by the camera as the decode region, plus a sweep line / spinner.
- `scanner-controls.tsx` — minimal flash and flip buttons positioned inside `env(safe-area-inset-*)`.
- `scanner-details-modal.tsx` — thin wrapper around the shared `ScannedEntityModal` with navigation disabled so the camera stays live behind it.

Dependency direction is strictly inward: components depend on `@/lib/scanner` (state machine, gates, geometry helpers) and `@/lib/api/barcodes-api` (lookup result type); nothing in this module is imported by other web features except through `ScannerApp`. The hook pattern centralizes all side effects (timers, audio context, media streams) while pure UI components stay stateless.