import { apiClient } from "../api-client";

export interface BatchDto {
  id: string;
  batchNumber: string;
  sku: string;
  componentName: string;
  quantityOnHand: number;
  manufactureDate: string;
  expiryDate: string;
  status: "ACTIVE" | "EXPIRED" | "QUARANTINED";
}

export interface CreateBatchPayload {
  batchNumber: string;
  sku: string;
  componentName: string;
  quantityOnHand: number;
  manufactureDate: string;
  expiryDate: string;
  status?: "ACTIVE" | "EXPIRED" | "QUARANTINED";
}

export interface UpdateBatchPayload {
  batchNumber?: string;
  sku?: string;
  componentName?: string;
  quantityOnHand?: number;
  manufactureDate?: string;
  expiryDate?: string;
  status?: "ACTIVE" | "EXPIRED" | "QUARANTINED";
}

const STORAGE_KEY = "ananya_batches_store";

const initialBatches: BatchDto[] = [
  {
    id: "bat-1",
    batchNumber: "BAT-2026-0811",
    sku: "CHEM-SOLDER-01",
    componentName: "Lead-Free Solder Paste SAC305",
    quantityOnHand: 45,
    manufactureDate: "2026-01-10",
    expiryDate: "2026-07-10",
    status: "ACTIVE",
  },
  {
    id: "bat-2",
    batchNumber: "BAT-2026-0922",
    sku: "ADHESIVE-EP-02",
    componentName: "Thermal Conductive Epoxy Compound",
    quantityOnHand: 12,
    manufactureDate: "2025-08-15",
    expiryDate: "2026-02-15",
    status: "ACTIVE",
  },
];

function getStoredBatches(): BatchDto[] {
  if (typeof window === "undefined") return initialBatches;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialBatches));
    return initialBatches;
  }
  try {
    return JSON.parse(stored) as BatchDto[];
  } catch {
    return initialBatches;
  }
}

function setStoredBatches(batches: BatchDto[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  }
}

export const batchesApi = {
  getAll: async (): Promise<BatchDto[]> => {
    try {
      const remote = await apiClient.get<BatchDto[]>("/inventory/batches");
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch {
      // Fallback to local persistent store if endpoint not mounted
    }
    return getStoredBatches();
  },

  getById: async (id: string): Promise<BatchDto> => {
    const all = await batchesApi.getAll();
    const found = all.find((b) => b.id === id);
    if (!found) throw new Error("Batch record not found");
    return found;
  },

  create: async (payload: CreateBatchPayload): Promise<BatchDto> => {
    try {
      return await apiClient.post<BatchDto>("/inventory/batches", payload);
    } catch {
      const all = getStoredBatches();
      const newBatch: BatchDto = {
        id: `bat-${Date.now()}`,
        batchNumber: payload.batchNumber,
        sku: payload.sku,
        componentName: payload.componentName,
        quantityOnHand: payload.quantityOnHand,
        manufactureDate: payload.manufactureDate,
        expiryDate: payload.expiryDate,
        status: payload.status ?? "ACTIVE",
      };
      const updated = [newBatch, ...all];
      setStoredBatches(updated);
      return newBatch;
    }
  },

  update: async (
    id: string,
    payload: UpdateBatchPayload,
  ): Promise<BatchDto> => {
    try {
      return await apiClient.put<BatchDto>(
        `/inventory/batches/${id}`,
        payload,
      );
    } catch {
      const all = getStoredBatches();
      const idx = all.findIndex((b) => b.id === id);
      if (idx === -1) throw new Error("Batch record not found");
      const existing = all[idx]!;
      const updatedBatch: BatchDto = {
        ...existing,
        ...payload,
      };
      all[idx] = updatedBatch;
      setStoredBatches(all);
      return updatedBatch;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await apiClient.delete(`/inventory/batches/${id}`);
    } catch {
      const all = getStoredBatches();
      const filtered = all.filter((b) => b.id !== id);
      setStoredBatches(filtered);
    }
  },
};
