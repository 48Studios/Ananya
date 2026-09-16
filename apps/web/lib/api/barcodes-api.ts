import { apiClient } from "../api-client";

export type BarcodeFormat = "CODE128" | "CODE39" | "EAN13" | "UPCA";

export type EntityType =
  "COMPONENT" | "LOCATION" | "WORK_ORDER" | "PURCHASE_ORDER" | "PROJECT";

export interface BarcodeLookupResult {
  found: boolean;
  entityType: EntityType;
  entityId: string;
  code: string;
  qrPayload: string;
  name: string;
  subtitle: string;
  targetUrl: string;
  details: Record<string, unknown>;
}

export interface BarcodePayloadResult {
  entityType: EntityType;
  entityId: string;
  primaryCode: string;
  qrPayload: string;
  title: string;
  subtitle: string;
}

export interface LabelData {
  id: string;
  entityType: EntityType;
  primaryCode: string;
  qrPayload: string;
  title: string;
  subtitle: string;
  attribute1?: string;
  attribute2?: string;
}

export interface BatchLabelsPayload {
  entityType: EntityType;
  ids: string[];
}

export const barcodesApi = {
  lookup: (code: string): Promise<BarcodeLookupResult> => {
    let cleanCode = code.trim();
    if (cleanCode.includes("?code=") || cleanCode.includes("&code=")) {
      try {
        const dummyBase = cleanCode.startsWith("http")
          ? cleanCode
          : `http://localhost/${cleanCode.replace(/^\/+/, "")}`;
        const parsed = new URL(dummyBase);
        const inner = parsed.searchParams.get("code");
        if (inner && inner.trim()) {
          cleanCode = decodeURIComponent(inner.trim());
        }
      } catch {
        // Fall back to cleanCode as-is
      }
    }
    return apiClient.get<BarcodeLookupResult>(
      `/barcodes/lookup?code=${encodeURIComponent(cleanCode)}`,
    );
  },

  generatePayload: (
    entityType: EntityType,
    entityId: string,
  ): Promise<LabelData> =>
    apiClient.post<
      LabelData,
      { entityType: EntityType; entityId: string }
    >("/barcodes/generate", {
      entityType,
      entityId,
    }),

  getBatchLabels: (payload: BatchLabelsPayload): Promise<LabelData[]> =>
    apiClient.post<LabelData[], BatchLabelsPayload>(
      "/barcodes/batch-labels",
      payload,
    ),
};
