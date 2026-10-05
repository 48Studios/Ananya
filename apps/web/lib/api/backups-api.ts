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

export interface RestoreOperation {
  id: string;
  artifactId?: string | null;
  status: string;
  scope: Record<string, unknown>;
  conflictPolicy: string;
  plan?: Record<string, unknown> | null;
  planHash?: string | null;
  result?: Record<string, unknown> | null;
  recoveryInfo?: Record<string, unknown> | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export const backupsApi = {
  artifacts: () => apiClient.get<BackupArtifact[]>("/backups/artifacts"),
  jobs: () => apiClient.get<BackupJob[]>("/backups/jobs"),
  restores: () => apiClient.get<RestoreOperation[]>("/backups/restores"),
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
    apiClient.postFormData<Record<string, unknown>>(
      "/backups/restore/preview",
      formData,
    ),
  restore: (formData: FormData) =>
    apiClient.postFormData<Record<string, unknown>>(
      "/backups/restore",
      formData,
    ),
};
