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
      const errMsg = err instanceof Error ? err.message : String(err);
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
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Datasheet extraction failed: ${errMsg}`);
      return null;
    }
  }
}
