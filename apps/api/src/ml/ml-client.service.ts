import { Injectable, Logger } from '@nestjs/common';
import { EvidenceItemDto } from './dtos';

export interface MlPredictCategoryItem {
  category: string;
  subcategory?: string | null;
  resolution?: 'EXISTING' | 'NEW_CANDIDATE' | 'UNKNOWN';
  category_id?: string | null;
  category_code?: string | null;
  category_path?: string[];
  parent_category_id?: string | null;
  parent_category_code?: string | null;
  suggested_parent?: string | null;
  proposed_description?: string | null;
  candidates?: Array<{
    category_id?: string | null;
    category_name: string;
    category_code?: string | null;
    category_path?: string[];
    confidence: number;
    evidence?: EvidenceItemDto[];
  }>;
  confidence: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  parent_category?: string | null;
  evidence?: EvidenceItemDto[];
}

/**
 * Evidence as emitted by the ML service.
 *
 * `page` and `text` are produced only by the datasheet extractor (Pass 2): the
 * page the value was read from and the verbatim excerpt that produced it. Every
 * other producer leaves them unset, and this contract never invents them.
 */
export interface MlEvidenceItem {
  type: string;
  description: string;
  weight: number;
  source?: string | null;
  page?: number | null;
  text?: string | null;
}

/** One attribute as extracted from a datasheet by the ML extractor. */
export interface MlExtractedAttribute {
  code: string;
  value: string | number | boolean | null;
  unit?: string | null;
  formatted: string;
  confidence: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: MlEvidenceItem[];
}

/** Versioned payload returned by `POST /v1/extract/datasheet`. */
export interface MlDatasheetExtractionResponse {
  attributes: Record<string, MlExtractedAttribute>;
  extracted_text_preview?: string | null;
  extracted_text?: string | null;
  page_count?: number | null;
  pages_analyzed?: number | null;
  extractor_version?: string | null;
}

export interface MlSuggestResponse {
  category_predictions: MlPredictCategoryItem[];
  manufacturer: {
    resolution?: 'EXISTING' | 'NEW_CANDIDATE' | 'UNKNOWN';
    manufacturer?: string | null;
    manufacturer_id?: string | null;
    confidence: number;
    confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
    match_type: string;
    code?: string | null;
    evidence?: EvidenceItemDto[];
    candidates?: Array<{
      manufacturer_id?: string | null;
      name: string;
      code?: string | null;
      confidence: number;
      evidence?: EvidenceItemDto[];
    }>;
  };
  duplicates: {
    is_duplicate: boolean;
    matches: Array<{
      id: string;
      sku: string;
      similarity: number;
      confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
      match_type: string;
      reason: string;
      evidence?: EvidenceItemDto[];
    }>;
  };
  extracted_attributes: Record<
    string,
    {
      code: string;
      value: string | number | boolean | null;
      unit?: string | null;
      formatted: string;
      confidence: number;
      confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
      evidence?: EvidenceItemDto[];
    }
  >;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  overall_evidence?: EvidenceItemDto[];
  execution_time_ms: number;
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeMsg =
    cause instanceof Error
      ? ` (cause: ${cause.message})`
      : typeof cause === 'string' || typeof cause === 'number'
        ? ` (cause: ${String(cause)})`
        : '';
  return `${err.message}${causeMsg}`;
}

/** Why an ML operations call did not succeed. See `callMlOps`. */
export type MlOpsFailureKind =
  'DISABLED' | 'UNREACHABLE' | 'CONFLICT' | 'NOT_FOUND' | 'ERROR';

export type MlOpsCallOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: MlOpsFailureKind;
      message: string;
      status?: number;
      /** Machine-readable reason when the ML service supplied one. */
      reason?: string;
    };

/** Identity of the model artifact the ML process is SERVING (not the one on disk). */
export interface MlRunningModel {
  loaded: boolean;
  loadedAt?: string | null;
  artifactSha256?: string | null;
  activeVersion?: string | null;
  versionSource?: 'CHECKSUM' | 'DEPLOYMENT_METADATA' | null;
  recordedActiveVersion?: string | null;
}

export interface MlReadyResponse {
  ready: boolean;
  models_loaded: Record<string, boolean>;
  version: string;
  running_model?: MlRunningModel | null;
}

export interface MlModelVersion {
  version: string;
  createdAt?: string | null;
  artifactExists: boolean;
  artifactSha256?: string | null;
  artifactSizeBytes?: number | null;
  championModel?: string | null;
  evaluation?: Record<string, unknown> | null;
  datasetVersion?: string | null;
  deployable: boolean;
}

export interface MlActiveDeployment {
  /** The version the deployment tool recorded. */
  deployedVersion?: string | null;
  /** The version whose artifact checksum matches production — the trustworthy one. */
  artifactVersion?: string | null;
  artifactVersionSource?: 'CHECKSUM' | 'DEPLOYMENT_METADATA' | null;
  deployedAt?: string | null;
  qualityGatesPassed?: boolean | null;
  artifactSha256?: string | null;
  artifactSizeBytes?: number | null;
  rollbackAvailable: boolean;
  backupSha256?: string | null;
}

export interface MlModelRegistryResponse {
  active: MlActiveDeployment;
  running: MlRunningModel;
  versions: MlModelVersion[];
}

export interface MlTrainingRunPayload {
  runId: string;
  status: string;
  phase?: string | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  candidateVersion?: string | null;
  baseModelVersion?: string | null;
  pipelineVersion?: string | null;
  datasetVersion?: string | null;
  datasetFingerprint?: string | null;
  datasetRecordCount?: number | null;
  feedbackRecordCount?: number | null;
  trainingRecordCount?: number | null;
  validationRecordCount?: number | null;
  quarantineRecordCount?: number | null;
  evaluationSummary?: Record<string, unknown> | null;
  gateSummary?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  artifactReference?: string | null;
  log?: string[];
  cancellable?: boolean;
}

export interface MlModelDeploymentPayload {
  artifactVersion?: string | null;
  previousVersion?: string | null;
  restoredVersion?: string | null;
  deployedAt?: string | null;
  artifactSha256?: string | null;
  runningVersion?: string | null;
  reloadPending?: boolean;
  reloadError?: string | null;
  deploymentMetadataStale?: boolean;
}

export interface MlDatasetSnapshot {
  datasetVersion: string;
  createdAt?: string | null;
  fingerprint?: string | null;
  totalSourceRecords?: number | null;
  totalExpandedExamples?: number | null;
  trainSize?: number | null;
  valSize?: number | null;
  duplicatePairsCount?: number | null;
  distinctBaseFamilies?: number | null;
  dataLeakageVerified?: boolean | null;
  overlapCount?: number | null;
  categories?: string[];
}

export interface MlDatasetOverview {
  current?: MlDatasetSnapshot | null;
  snapshots: MlDatasetSnapshot[];
  quarantine: Record<string, unknown>;
  distribution: Record<string, unknown>;
}

/**
 * Reads the ML service's error body without assuming its shape.
 *
 * FastAPI answers a raised `HTTPException` with `{detail: ...}`, and our routes
 * raise `detail` as either a string or `{reason, message}`. Both are accepted; an
 * unparseable body degrades to a generic message rather than throwing inside the
 * error path.
 */
async function readMlErrorBody(res: Response): Promise<{
  reason?: string;
  message: string;
}> {
  const fallback = `ananya-ml returned HTTP status ${res.status}`;
  try {
    const body = (await res.json()) as { detail?: unknown };
    const detail = body?.detail;
    if (typeof detail === 'string' && detail.length > 0) {
      return { message: detail };
    }
    if (detail && typeof detail === 'object') {
      const record = detail as { reason?: unknown; message?: unknown };
      const reason =
        typeof record.reason === 'string' ? record.reason : undefined;
      const message =
        typeof record.message === 'string' && record.message.length > 0
          ? record.message
          : fallback;
      return { reason, message };
    }
  } catch {
    // Body was not JSON; the status-derived message is the honest answer.
  }
  return { message: fallback };
}

@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private readonly baseUrl: string;
  private readonly isEnabled: boolean;
  private readonly timeoutMs: number = 1500;

  constructor() {
    this.baseUrl = (
      process.env.ML_SERVICE_URL || 'http://localhost:5001'
    ).replace(/\/$/, '');
    this.isEnabled = process.env.ML_SERVICE_ENABLED !== 'false';
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  async health(): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async suggest(payload: {
    query: string;
    part_number?: string;
    description?: string;
    datasheet_text?: string;
    existing_components?: Array<{
      id: string;
      sku: string;
      name?: string;
      description?: string;
    }>;
    erp_manufacturers?: Array<{
      id: string;
      name: string;
      code: string;
      aliases: string[];
      normalized_name: string;
      is_active: boolean;
    }>;
    erp_categories?: Array<{
      id: string;
      name: string;
      code: string;
      description?: string | null;
      parent_id?: string | null;
      parent_name?: string | null;
      path: string[];
      aliases: string[];
      is_active: boolean;
    }>;
    datapack_hints?: unknown[];
  }): Promise<MlSuggestResponse | null> {
    if (!this.isEnabled) return null;

    try {
      const res = await fetch(`${this.baseUrl}/v1/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        this.logger.warn(`ananya-ml returned HTTP status ${res.status}`);
        return null;
      }

      return (await res.json()) as MlSuggestResponse;
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`ananya-ml connection failed or timed out: ${errMsg}`);
      return null;
    }
  }

  /**
   * Calls the datasheet extraction endpoint.
   *
   * Returns the whole versioned extraction payload (attributes, evidence with
   * page/excerpt, extracted text, page counts, extractor version) rather than
   * just the attribute map: Documentation Intelligence needs the text to feed
   * the existing identity/category intelligence and the evidence to justify a
   * reviewer's decision. Returns `null` when the ML service is disabled or the
   * call fails — the caller treats that as an explicit analysis failure.
   */
  async extractDatasheet(payload: {
    text?: string;
    pdf_base64?: string;
    datapack_hints?: unknown[];
  }): Promise<MlDatasheetExtractionResponse | null> {
    if (!this.isEnabled) return null;

    try {
      const res = await fetch(`${this.baseUrl}/v1/extract/datasheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs * 2),
      });

      if (!res.ok) {
        this.logger.warn(
          `ananya-ml datasheet extraction returned HTTP status ${res.status}`,
        );
        return null;
      }

      const data = (await res.json()) as Record<string, unknown>;

      // A response without an attributes map is not a usable extraction.
      if (
        typeof data.attributes !== 'object' ||
        data.attributes === null ||
        Array.isArray(data.attributes)
      ) {
        this.logger.warn(
          'ananya-ml datasheet extraction returned no attributes map.',
        );
        return null;
      }

      return data as unknown as MlDatasheetExtractionResponse;
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Datasheet extraction failed: ${errMsg}`);
      return null;
    }
  }

  async suggestAttributeBindings(payload: {
    attributeName: string;
    attributeCode?: string;
    description?: string;
    dataType?: string;
    unitCategory?: string;
    categories: Array<{ id: string; code: string; name: string }>;
    datapack_hints?: unknown[];
    component_category_counts?: Record<string, number>;
  }): Promise<Array<{
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    confidence: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    evidence: EvidenceItemDto[];
    modelVersion: string;
  }> | null> {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/v1/attributes/suggest-bindings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        suggestions?: Array<{
          categoryId: string;
          categoryCode: string;
          categoryName: string;
          confidence: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
          reason: string;
          evidence: EvidenceItemDto[];
          modelVersion: string;
        }>;
      };
      return data.suggestions || null;
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Suggest attribute bindings failed: ${errMsg}`);
      return null;
    }
  }

  async suggestCategoryAttributes(payload: {
    categoryId: string;
    categoryCode?: string;
    categoryName: string;
    existingAttributes: unknown[];
    boundAttributeIds: string[];
    datapack_hints?: unknown[];
    categoryComponentCount?: number;
  }): Promise<Array<{
    attributeDefinitionId?: string | null;
    code: string;
    name: string;
    dataType: string;
    unitCategory?: string | null;
    defaultUnit?: string | null;
    groupName?: string | null;
    confidence: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    isAlreadyBound: boolean;
    reason: string;
    evidence: EvidenceItemDto[];
  }> | null> {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/v1/attributes/suggest-category-attributes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        suggestions?: Array<{
          attributeDefinitionId?: string | null;
          code: string;
          name: string;
          dataType: string;
          unitCategory?: string | null;
          defaultUnit?: string | null;
          groupName?: string | null;
          confidence: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
          isAlreadyBound: boolean;
          reason: string;
          evidence: EvidenceItemDto[];
        }>;
      };
      return data.suggestions || null;
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Suggest category attributes failed: ${errMsg}`);
      return null;
    }
  }

  async suggestAttributeConfig(payload: {
    name: string;
    description?: string;
    existingAttributes: unknown[];
    datapack_hints?: unknown[];
  }): Promise<{
    suggestedCode: string;
    suggestedDataType: string;
    unitCategory?: string | null;
    defaultUnit?: string | null;
    displayUnits: string[];
    groupName?: string | null;
    suggestedAliases: string[];
    suggestedOptions: string[];
    validationRules?: Record<string, unknown> | null;
    canonicalMatch?: {
      id: string;
      name: string;
      code?: string;
      similarity: number;
    } | null;
    confidence: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    evidence: EvidenceItemDto[];
  } | null> {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(`${this.baseUrl}/v1/attributes/suggest-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        suggestion?: {
          suggestedCode: string;
          suggestedDataType: string;
          unitCategory?: string | null;
          defaultUnit?: string | null;
          displayUnits: string[];
          groupName?: string | null;
          suggestedAliases: string[];
          suggestedOptions: string[];
          validationRules?: Record<string, unknown> | null;
          canonicalMatch?: {
            id: string;
            name: string;
            code?: string;
            similarity: number;
          } | null;
          confidence: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
          reason: string;
          evidence: EvidenceItemDto[];
        };
      };
      return data.suggestion || null;
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Suggest attribute config failed: ${errMsg}`);
      return null;
    }
  }

  async detectAttributeDuplicates(payload: {
    name: string;
    code?: string;
    existingAttributes: unknown[];
    existingBindings: unknown[];
    threshold?: number;
    datapack_hints?: unknown[];
  }): Promise<{
    isDuplicate: boolean;
    matches: Array<{
      attributeId: string;
      code: string;
      name: string;
      similarity: number;
      confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      matchType: string;
      usageCount: number;
      boundCategories: string[];
      aliases: string[];
      reason: string;
      evidence: EvidenceItemDto[];
    }>;
    suggestedAliases: string[];
  } | null> {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/v1/attributes/detect-duplicates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        isDuplicate: boolean;
        matches: Array<{
          attributeId: string;
          code: string;
          name: string;
          similarity: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
          matchType: string;
          usageCount: number;
          boundCategories: string[];
          aliases: string[];
          reason: string;
          evidence: EvidenceItemDto[];
        }>;
        suggestedAliases: string[];
      };
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Detect attribute duplicates failed: ${errMsg}`);
      return null;
    }
  }

  async suggestEnumValues(payload: {
    attributeCode: string;
    attributeName: string;
    existingOptions?: string[];
    datapack_hints?: unknown[];
  }): Promise<Array<{
    code: string;
    label: string;
    source: string;
    confidence: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  }> | null> {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/v1/attributes/suggest-enum-values`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        suggestedOptions?: Array<{
          code: string;
          label: string;
          source: string;
          confidence: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
        }>;
      };
      return data.suggestedOptions || null;
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Suggest enum values failed: ${errMsg}`);
      return null;
    }
  }

  async auditAttributeLibrary(payload: {
    attributes: unknown[];
    categories: unknown[];
    bindings: unknown[];
    componentCountsByAttribute: Record<string, number>;
    componentCountsByCategoryAttribute: Record<string, number>;
    datapack_hints?: unknown[];
  }): Promise<{
    summary: {
      totalAttributes: number;
      possibleDuplicates: number;
      suspiciousBindings: number;
      missingExpectedAttributes: number;
      unusedAttributes: number;
    };
    issues: Array<{
      id: string;
      type:
        | 'DUPLICATE_ATTRIBUTE'
        | 'SUSPICIOUS_BINDING'
        | 'MISSING_EXPECTED_ATTRIBUTE'
        | 'UNUSED_ATTRIBUTE'
        | 'INCONSISTENT_CONFIG';
      severity: 'WARNING' | 'INFO' | 'CRITICAL';
      attributeId?: string | null;
      attributeCode?: string | null;
      attributeName?: string | null;
      categoryId?: string | null;
      categoryName?: string | null;
      confidence: number;
      confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
      payload?: Record<string, unknown>;
      evidence: EvidenceItemDto[];
    }>;
  } | null> {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(`${this.baseUrl}/v1/attributes/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs * 3),
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        summary: {
          totalAttributes: number;
          possibleDuplicates: number;
          suspiciousBindings: number;
          missingExpectedAttributes: number;
          unusedAttributes: number;
        };
        issues: Array<{
          id: string;
          type:
            | 'DUPLICATE_ATTRIBUTE'
            | 'SUSPICIOUS_BINDING'
            | 'MISSING_EXPECTED_ATTRIBUTE'
            | 'UNUSED_ATTRIBUTE'
            | 'INCONSISTENT_CONFIG';
          severity: 'WARNING' | 'INFO' | 'CRITICAL';
          attributeId?: string | null;
          attributeCode?: string | null;
          attributeName?: string | null;
          categoryId?: string | null;
          categoryName?: string | null;
          confidence: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
          reason: string;
          payload?: Record<string, unknown>;
          evidence: EvidenceItemDto[];
        }>;
      };
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Audit attribute library failed: ${errMsg}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // ML Operations — training control plane
  // ---------------------------------------------------------------------------

  /**
   * Outcome of an ML operations call.
   *
   * The older methods on this client collapse every failure to `null`, which is
   * fine for a suggestion that can fall back to a deterministic rule. It is not
   * fine for a control plane: "the ML service is disabled", "the ML service did
   * not answer", "the ML service refused because a run is already active" and "the
   * candidate did not pass its gates" are four different operator messages and
   * three different HTTP statuses. So these methods report the distinction instead
   * of erasing it.
   */
  private async callMlOps<T>(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<MlOpsCallOutcome<T>> {
    if (!this.isEnabled) {
      return {
        ok: false,
        kind: 'DISABLED',
        message: 'The ML service is disabled in this deployment.',
      };
    }
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        return { ok: true, data: (await res.json()) as T };
      }
      const body = await readMlErrorBody(res);
      if (res.status === 409) {
        return {
          ok: false,
          kind: 'CONFLICT',
          status: res.status,
          reason: body.reason,
          message: body.message,
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          kind: 'NOT_FOUND',
          status: res.status,
          reason: body.reason,
          message: body.message,
        };
      }
      return {
        ok: false,
        kind: 'ERROR',
        status: res.status,
        reason: body.reason,
        message: body.message,
      };
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`ML operations call ${path} failed: ${errMsg}`);
      return { ok: false, kind: 'UNREACHABLE', message: errMsg };
    }
  }

  /** Liveness + readiness + the identity of the model actually being served. */
  mlOpsReady(): Promise<MlOpsCallOutcome<MlReadyResponse>> {
    return this.callMlOps<MlReadyResponse>(
      '/ready',
      { method: 'GET' },
      this.timeoutMs,
    );
  }

  /** Registry contents, the recorded deployment and the running model. */
  mlOpsModels(): Promise<MlOpsCallOutcome<MlModelRegistryResponse>> {
    return this.callMlOps<MlModelRegistryResponse>(
      '/v1/models',
      { method: 'GET' },
      this.timeoutMs,
    );
  }

  /** Current dataset snapshot, quarantine counts and corpus distribution. */
  mlOpsDataset(): Promise<MlOpsCallOutcome<MlDatasetOverview>> {
    return this.callMlOps<MlDatasetOverview>(
      '/v1/datasets/current',
      { method: 'GET' },
      this.timeoutMs * 2,
    );
  }

  /**
   * Starts a training run.
   *
   * The `runId` is the API's own run id, so the job the ML service reports back is
   * unambiguously the row the operator triggered. No pipeline argument crosses this
   * boundary: there is no version, no path, no hyperparameter and no command.
   */
  mlOpsStartTrainingRun(payload: {
    runId: string;
    requestedBy?: string | null;
  }): Promise<MlOpsCallOutcome<MlTrainingRunPayload>> {
    return this.callMlOps<MlTrainingRunPayload>(
      '/v1/training/runs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      this.timeoutMs * 2,
    );
  }

  mlOpsTrainingRun(
    runId: string,
  ): Promise<MlOpsCallOutcome<MlTrainingRunPayload>> {
    return this.callMlOps<MlTrainingRunPayload>(
      `/v1/training/runs/${encodeURIComponent(runId)}`,
      { method: 'GET' },
      this.timeoutMs,
    );
  }

  /** Promotes a PASSED candidate through the existing `deploy.py` tool. */
  mlOpsDeployCandidate(
    runId: string,
  ): Promise<MlOpsCallOutcome<MlModelDeploymentPayload>> {
    return this.callMlOps<MlModelDeploymentPayload>(
      '/v1/models/deploy',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      },
      this.timeoutMs * 4,
    );
  }

  /** Restores the previous production artifact through `deploy.py --rollback`. */
  mlOpsRollback(): Promise<MlOpsCallOutcome<MlModelDeploymentPayload>> {
    return this.callMlOps<MlModelDeploymentPayload>(
      '/v1/models/rollback',
      { method: 'POST' },
      this.timeoutMs * 4,
    );
  }

  /** Re-reads the production artifact into the running process (writes nothing). */
  mlOpsReloadModel(): Promise<MlOpsCallOutcome<MlModelDeploymentPayload>> {
    return this.callMlOps<MlModelDeploymentPayload>(
      '/v1/models/reload',
      { method: 'POST' },
      this.timeoutMs * 4,
    );
  }
}
