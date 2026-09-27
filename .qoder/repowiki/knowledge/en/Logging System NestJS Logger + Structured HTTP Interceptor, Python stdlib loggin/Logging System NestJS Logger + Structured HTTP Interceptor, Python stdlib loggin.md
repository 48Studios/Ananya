---
kind: logging_system
name: 'Logging System: NestJS Logger + Structured HTTP Interceptor, Python stdlib logging'
category: logging_system
scope:
    - '**'
source_files:
    - apps/api/src/common/logging/http-logging.interceptor.ts
    - apps/api/src/common/logging/http-logging.interceptor.spec.ts
    - apps/api/src/main.ts
    - apps/ml/training/tui/app.py
    - apps/ml/training/collectors/ananya_db.py
    - apps/ml/training/collectors/web_collector.py
    - apps/ml/training/cli.py
---

## Overview

The Ananya ERP monorepo has two independent logging systems — one for the NestJS API and one for the FastAPI ML service. There is no shared logging framework across the two services.

### NestJS API (`apps/api`)

- **Framework**: `@nestjs/common`'s built-in `Logger` class (a thin wrapper around Node's console).
- **Initialization**: No custom logger factory or global configuration in `main.ts`. The bootstrap function only registers a global `HttpLoggingInterceptor`, a `LocationExceptionFilter`, and a `ValidationPipe`; it does not call `setGlobalLogLevels`, `setLogLevels`, or configure transports.
- **Per-class loggers**: Every service/controller that logs creates its own instance via `new Logger(ClassName.name)`, e.g. `DocumentsService`, `ImportExportController`, `ComponentConsolidationService`, `AttributeReviewApplyService`, `ComponentReviewAnalyzer`. This gives each log line a class-name prefix provided by Nest's logger.
- **HTTP access/error logging**: Centralized in `apps/api/src/common/logging/http-logging.interceptor.ts` (`HttpLoggingInterceptor`). It is registered globally via `app.useGlobalInterceptors(new HttpLoggingInterceptor())` in `main.ts`.
- **Structured fields**: Access logs are serialized to JSON via a private `serialize(value)` method that calls `JSON.stringify` on an object with keys: `event`, `requestId`, `method`, `route`, `statusCode`, `durationMs`, `ip`, `userAgent`, `connectionClosed`. Error logs add `errorName`, `errorMessage`, `stack`. A request-scoped `X-Request-Id` header is generated via `crypto.randomUUID()` (or forwarded from `x-request-id`) and echoed back as response header `X-Request-Id`.
- **Duration measurement**: Uses `performance.now()` before/after the request pipeline; rounded to centiseconds.
- **Routing**: Extracted from `request.route.path` (joined with `|` if array), falling back to `originalUrl` / `url`.
- **Error extraction**: `toErrorLike` normalizes thrown values into `{ name?, message?, stack?, status?, statusCode? }` by inspecting `instanceof Error` and then duck-typing plain objects.
- **Switchable sinks**:
  - Access logging toggled by env var `HTTP_ACCESS_LOGGING` (default enabled; disabled when value equals `'false'`).
  - Error logging toggled by env var `HTTP_ERROR_LOGGING` (default enabled; disabled when value equals `'false'`).
- **Log levels used**: Across the codebase, classes use `logger.debug`, `logger.warn`, and `logger.error`. `logger.log` is reserved for the interceptor's structured access records. No `logger.verbose` usage was observed in the sampled files.
- **Non-structured console output**: `main.ts` uses a bare `console.log(...)` to print the startup URL — this bypasses the Nest `Logger` entirely.

### ML Service (`apps/ml`)

- **Framework**: Python standard library `logging` module.
- **Root logger setup**: No `basicConfig` call in `apps/ml/app/main.py` (the FastAPI entrypoint). Loggers are obtained via `logging.getLogger(__name__)` in collectors (`ananya_db.py`, `web_collector.py`, `coverage.py`) and via `logging.getLogger("ananya.ml.tui")` in the TUI.
- **TUI logging redirection**: `apps/ml/training/tui/app.py` defines `TUILogHandler(logging.Handler)` which intercepts `logging.LogRecord`s and emits them as `LogEvent` objects into the Rich TUI event stream, carrying `level`, `logger_name`, `message`, `timestamp`. The `TrainerTUI` attaches this handler to the root logger while keeping existing `StreamHandler`s muted so TUI output doesn't interleave with stdout/stderr.
- **CLI option**: `apps/ml/training/cli.py` exposes `--no-tui` which disables the Rich dashboard and falls back to standard logging output.
- **No structured format**: Messages are emitted as plain strings through the standard `logging` interface; there is no JSON formatter or correlation ID propagation.

### Web App (`apps/web`)

No application-level logging system was found in the Next.js frontend. Browser-side diagnostics would rely on browser devtools rather than a dedicated logger.

## Key Files

- `apps/api/src/common/logging/http-logging.interceptor.ts` — structured HTTP access/error interceptor
- `apps/api/src/common/logging/http-logging.interceptor.spec.ts` — unit tests for the interceptor
- `apps/api/src/main.ts` — bootstrap where the global interceptor is registered
- `apps/ml/training/tui/app.py` — `TUILogHandler` and TUI logging redirection
- `apps/ml/training/collectors/ananya_db.py` — example stdlib logger usage
- `apps/ml/training/collectors/web_collector.py` — example stdlib logger usage
- `apps/ml/training/cli.py` — `--no-tui` flag documentation

## Conventions and Constraints

1. **NestJS services/controllers create per-class loggers** using `new Logger(ClassName.name)` imported from `@nestjs/common`. This is the pattern observed across all logged services (documents, import-export, ml modules).
2. **HTTP request/response logging is centralized** in `HttpLoggingInterceptor` and registered globally via `useGlobalInterceptors`; business logic should not emit HTTP access logs directly.
3. **Access/error log streams are independently switchable** via environment variables `HTTP_ACCESS_LOGGING` and `HTTP_ERROR_LOGGING`; both default to enabled unless set to the literal string `'false'`.
4. **Structured access logs are JSON objects** produced by `JSON.stringify` with a fixed schema (`event`, `requestId`, `method`, `route`, `statusCode`, `durationMs`, `ip`, `userAgent`, plus error-specific fields). Consumers should parse the body as JSON rather than relying on text formatting.
5. **Correlation IDs flow through `X-Request-Id`**: the interceptor reads the incoming header (if present) or generates a UUID, and writes it back as a response header.
6. **ML service uses stdlib `logging` without central configuration**; individual modules obtain loggers via `logging.getLogger(__name__)` and the TUI hijacks the root logger via a custom `TUILogHandler`.
7. **No cross-service log correlation**: the API's `X-Request-Id` is not propagated to the ML service, and the ML service has no equivalent correlation mechanism.
8. **No shared logging package**: the NestJS and Python services have completely separate logging implementations with no common abstraction.