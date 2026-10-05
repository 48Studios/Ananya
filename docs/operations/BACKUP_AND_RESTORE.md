# Backup and Restore

Ananya stores backup metadata in PostgreSQL and archive bytes through the
configured document storage provider (`STORAGE_DRIVER=local` by default).
Archives use format version `1`: a gzip-compressed JSON payload containing a
manifest, table records, and document bytes. The manifest and artifact row
record the scope, expanded domain components/dependencies, checksum,
application version, and encryption state. Archive validation rejects
unsupported versions, oversized payloads, duplicate paths, absolute paths, and
`..` traversal before restore.

## Encryption

When a passphrase is supplied, the payload is encrypted with AES-256-GCM. A
random salt is used with Node's scrypt KDF (`N=16384`, `r=8`, `p=1`), and the
salt, IV, authentication tag, and format version are stored in the archive
envelope. Passphrases and derived keys are never persisted or logged. An
encrypted archive cannot be recovered without its passphrase.

## Scheduling and safety

Schedules are durable rows in `backup_jobs`; runs and every retry attempt are
recorded in `backup_job_runs`. Times are interpreted in the configured IANA
timezone and stored as UTC instants, including DST transitions. Retries are
bounded by `retryLimit`, use exponential backoff with a maximum delay, and
classify permanent validation/authentication failures as non-retryable.
PostgreSQL advisory locks prevent duplicate execution. Stale worker runs are
marked failed during scheduler recovery. Restore operations use a separate
advisory lock and always create a pre-restore safety backup before changing
records.

Database records are restored in a Drizzle transaction. File writes occur after
the database transaction and use the storage provider's basename/path safety
checks, so filesystem recovery is compensating rather than atomic with the
database. Restore plans are persisted with the operation, but the current
implementation does not yet stage and promote files as one recoverable
workflow. Operators must retain the safety backup and verify the result when a
filesystem write fails.

## Selective scopes and UI

Selective backups accept domain component IDs rather than requiring users to
choose raw table names. Selecting a component expands required dependencies
(for example, Components includes Categories, Manufacturers, and Attributes)
and records the expanded scope in the manifest. Settings provides manual
backup creation, scheduled-job creation, pause/resume, run-now, deletion, and
restore preview controls. Job editing/details, paginated restore history, and
component-by-component restore conflict review remain future UI work.

## Storage and operational limits

Backup creation performs a temporary-filesystem free-space preflight with a
100 MiB safety floor and rejects archives above configured validation limits.
The current archive builder still materializes the compressed JSON payload and
file contents in memory; it is not a streaming archive implementation.
Retention and external object-storage providers require additional hardening
before production use at very large data volumes.

## Operations

1. Open **Settings → Backup & Restore**.
2. Create a full or selective backup and retain its checksum.
3. Download and validate an archive before moving it between deployments.
4. Preview the manifest and record counts before a restore.
5. Confirm the destructive restore explicitly and select `SKIP`, `UPDATE`, or
   `ABORT` conflict handling.

The backup API requires `Administration.Settings`. Storage capacity, provider
permissions, and passphrase recovery remain deployment responsibilities.
