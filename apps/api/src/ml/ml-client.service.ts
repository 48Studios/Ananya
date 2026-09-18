import { Injectable, Logger } from '@nestjs/common';
import { EvidenceItemDto } from './dtos';

export interface MlPredictCategoryItem {
  category: string;
  subcategory?: string | null;
  confidence: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  parent_category?: string | null;
  evidence?: EvidenceItemDto[];
}

export interface MlSuggestResponse {
  category_predictions: MlPredictCategoryItem[];
  manufacturer: {
    manufacturer: string;
    confidence: number;
    confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
    match_type: string;
    code?: string | null;
    evidence?: EvidenceItemDto[];
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
      : cause != null
        ? ` (cause: ${String(cause)})`
        : '';
  return `${err.message}${causeMsg}`;
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
    existing_components?: Array<{
      id: string;
      sku: string;
      name?: string;
      description?: string;
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

  async extractDatasheet(payload: {
    text?: string;
    pdf_base64?: string;
    datapack_hints?: unknown[];
  }): Promise<Record<string, unknown> | null> {
    if (!this.isEnabled) return null;

    try {
      const res = await fetch(`${this.baseUrl}/v1/extract/datasheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs * 2),
      });

      if (!res.ok) return null;
      const data = (await res.json()) as {
        attributes?: Record<string, unknown>;
      };
      return data.attributes || null;
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
      const res = await fetch(`${this.baseUrl}/v1/attributes/suggest-bindings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
      const res = await fetch(`${this.baseUrl}/v1/attributes/suggest-category-attributes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
      const res = await fetch(`${this.baseUrl}/v1/attributes/detect-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
      const res = await fetch(`${this.baseUrl}/v1/attributes/suggest-enum-values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
      type: 'DUPLICATE_ATTRIBUTE' | 'SUSPICIOUS_BINDING' | 'MISSING_EXPECTED_ATTRIBUTE' | 'UNUSED_ATTRIBUTE' | 'INCONSISTENT_CONFIG';
      severity: 'WARNING' | 'INFO' | 'CRITICAL';
      attributeId?: string | null;
      attributeName?: string | null;
      categoryId?: string | null;
      categoryName?: string | null;
      confidence: number;
      confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
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
          type: 'DUPLICATE_ATTRIBUTE' | 'SUSPICIOUS_BINDING' | 'MISSING_EXPECTED_ATTRIBUTE' | 'UNUSED_ATTRIBUTE' | 'INCONSISTENT_CONFIG';
          severity: 'WARNING' | 'INFO' | 'CRITICAL';
          attributeId?: string | null;
          attributeName?: string | null;
          categoryId?: string | null;
          categoryName?: string | null;
          confidence: number;
          confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
          reason: string;
          evidence: EvidenceItemDto[];
        }>;
      };
    } catch (err: unknown) {
      const errMsg = formatFetchError(err);
      this.logger.warn(`Audit attribute library failed: ${errMsg}`);
      return null;
    }
  }
}
