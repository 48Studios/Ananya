import { apiClient } from "../api-client";

export interface BackupArtifact {
  id: string;
  name: string;
  type: string;
  status: string;
  sizeBytes: number;
  encrypted: boolean;
  checksum?: string | null;
  createdAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface BackupJob {
  id: string;
  name: string;
  enabled: boolean;
  frequency: string;
  timeOfDay: string;
  timezone: string;
  scope: Record<string, unknown>;
  encrypted: boolean;
  retentionMaxCount?: number | null;
  retentionMaxAgeDays?: number | null;
  retryLimit?: number;
  retryInitialDelaySeconds?: number;
  retryMaxDelaySeconds?: number;
  notifyOnSuccess?: boolean;
  notifyOnFailure?: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastResult?: string | null;
  consecutiveFailures: number;
}

export interface BackupJobDetails {
  job: BackupJob & {
    retentionMaxCount?: number | null;
    retentionMaxAgeDays?: number | null;
    retryLimit: number;
    retryInitialDelaySeconds: number;
    retryMaxDelaySeconds: number;
    notifyOnSuccess: boolean;
    notifyOnFailure: boolean;
  };
  runs: Array<{
    id: string;
    status: string;
    attempt: number;
    startedAt?: string | null;
    endedAt?: string | null;
    artifactId?: string | null;
    errorMessage?: string | null;
  }>;
  health: {
    successRate: number;
    averageDurationMs: number;
    averageBackupSize: number;
    lastSuccessfulRun: unknown;
    lastFailedRun: unknown;
  };
}

export interface CanonicalRestorePlan {
  formatVersion: string;
  archiveChecksum: string;
  conflictPolicy: "SKIP" | "UPDATE" | "ABORT";
  components: string[];
  tables: string[];
  recordsToProcess: number;
  files: string[];
  destructive: boolean;
}

export interface RestorePreviewResult {
  operationId: string;
  planHash: string;
  conflictPolicy: "SKIP" | "UPDATE" | "ABORT";
  plan: CanonicalRestorePlan;
  preview: CanonicalRestorePlan;
}

export interface RestoreOperation {
  id: string;
  artifactId?: string | null;
  status: string;
  scope: Record<string, unknown>;
  conflictPolicy: string;
  plan?: CanonicalRestorePlan | null;
  planHash?: string | null;
  result?: Record<string, unknown> | null;
  recoveryInfo?: Record<string, unknown> | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface BackupsMetricsSnapshot {
  backupRunsStarted: number;
  backupRunsSucceeded: number;
  backupRunsFailed: number;
  backupRetries: number;
  backupBytesProduced: number;
  restoreOperationsStarted: number;
  restoreOperationsSucceeded: number;
  restoreOperationsFailed: number;
  retentionDeletions: number;
  notificationFailures: number;
  abandonedRunRecoveries: number;
  lastBackupDurationMs: number | null;
  averageBackupDurationMs: number | null;
  lastRestoreDurationMs: number | null;
  averageRestoreDurationMs: number | null;
}

export const backupsApi = {
  artifacts: () => apiClient.get<BackupArtifact[]>("/backups/artifacts"),
  jobs: () => apiClient.get<BackupJob[]>("/backups/jobs"),
  restores: () => apiClient.get<RestoreOperation[]>("/backups/restores"),
  metrics: () => apiClient.get<BackupsMetricsSnapshot>("/backups/metrics"),
  create: (data: Record<string, unknown>) =>
    apiClient.post<BackupArtifact>("/backups/artifacts", data),
  remove: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/backups/artifacts/${id}`),
  download: (id: string) =>
    apiClient.getBlob(`/backups/artifacts/${id}/download`),
  createJob: (data: Record<string, unknown>) =>
    apiClient.post<BackupJob>("/backups/jobs", data),
  updateJob: (id: string, data: Record<string, unknown>) =>
    apiClient.put<BackupJob>(`/backups/jobs/${id}`, data),
  deleteJob: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/backups/jobs/${id}`),
  jobDetails: (id: string) =>
    apiClient.get<BackupJobDetails>(`/backups/jobs/${id}/details`),
  restoreDetails: (id: string) =>
    apiClient.get<RestoreOperation>(`/backups/restores/${id}`),
  runJob: (id: string) =>
    apiClient.post<BackupArtifact>(`/backups/jobs/${id}/run`, {}),
  setJobEnabled: (id: string, enabled: boolean) =>
    apiClient.post<BackupJob>(`/backups/jobs/${id}/pause`, { enabled }),
  previewRestore: (formData: FormData) =>
    apiClient.postFormData<RestorePreviewResult>(
      "/backups/restore/preview",
      formData,
    ),
  previewArtifact: (id: string, data: Record<string, unknown>) =>
    apiClient.post<RestorePreviewResult>(`/backups/restore/preview/${id}`, data),
  restore: (formData: FormData) =>
    apiClient.postFormData<Record<string, unknown>>(
      "/backups/restore",
      formData,
    ),
  restoreArtifact: (id: string, data: Record<string, unknown>) =>
    apiClient.post<Record<string, unknown>>(`/backups/restore/artifact/${id}`, data),
};
