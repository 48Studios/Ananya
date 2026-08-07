import { apiClient } from "../api-client";

export interface WarehousePolicyDto {
  id: string;
  policyName: string;
  warehouseName: string;
  pickingRule: "FIFO" | "FEFO" | "LIFO" | "ZONE_BASED";
  putawayRule: "FAST_MOVING_FRONT" | "VOLUME_MATCHED" | "DIRECT_TO_BIN";
  isActive: boolean;
}

export interface CreateWarehousePolicyPayload {
  policyName: string;
  warehouseName: string;
  pickingRule: "FIFO" | "FEFO" | "LIFO" | "ZONE_BASED";
  putawayRule: "FAST_MOVING_FRONT" | "VOLUME_MATCHED" | "DIRECT_TO_BIN";
  isActive?: boolean;
}

export interface UpdateWarehousePolicyPayload {
  policyName?: string;
  warehouseName?: string;
  pickingRule?: "FIFO" | "FEFO" | "LIFO" | "ZONE_BASED";
  putawayRule?: "FAST_MOVING_FRONT" | "VOLUME_MATCHED" | "DIRECT_TO_BIN";
  isActive?: boolean;
}

const STORAGE_KEY = "ananya_warehouse_policies_store";

const initialPolicies: WarehousePolicyDto[] = [
  {
    id: "pol-1",
    policyName: "Electronics FIFO Picking Policy",
    warehouseName: "Main Assembly WH",
    pickingRule: "FIFO",
    putawayRule: "FAST_MOVING_FRONT",
    isActive: true,
  },
  {
    id: "pol-2",
    policyName: "Chemical & Paste FEFO Expiry Rule",
    warehouseName: "Raw Materials WH",
    pickingRule: "FEFO",
    putawayRule: "VOLUME_MATCHED",
    isActive: true,
  },
];

function getStoredPolicies(): WarehousePolicyDto[] {
  if (typeof window === "undefined") return initialPolicies;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialPolicies));
    return initialPolicies;
  }
  try {
    return JSON.parse(stored) as WarehousePolicyDto[];
  } catch {
    return initialPolicies;
  }
}

function setStoredPolicies(policies: WarehousePolicyDto[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policies));
  }
}

export const warehousePoliciesApi = {
  getAll: async (): Promise<WarehousePolicyDto[]> => {
    try {
      const remote = await apiClient.get<WarehousePolicyDto[]>(
        "/warehouse-policies",
      );
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch {
      // Fallback
    }
    return getStoredPolicies();
  },

  create: async (
    payload: CreateWarehousePolicyPayload,
  ): Promise<WarehousePolicyDto> => {
    try {
      return await apiClient.post<WarehousePolicyDto>(
        "/warehouse-policies",
        payload,
      );
    } catch {
      const all = getStoredPolicies();
      const newPolicy: WarehousePolicyDto = {
        id: `pol-${Date.now()}`,
        policyName: payload.policyName,
        warehouseName: payload.warehouseName,
        pickingRule: payload.pickingRule,
        putawayRule: payload.putawayRule,
        isActive: payload.isActive ?? true,
      };
      const updated = [newPolicy, ...all];
      setStoredPolicies(updated);
      return newPolicy;
    }
  },

  update: async (
    id: string,
    payload: UpdateWarehousePolicyPayload,
  ): Promise<WarehousePolicyDto> => {
    try {
      return await apiClient.put<WarehousePolicyDto>(
        `/warehouse-policies/${id}`,
        payload,
      );
    } catch {
      const all = getStoredPolicies();
      const idx = all.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error("Policy not found");
      const updatedPolicy: WarehousePolicyDto = {
        ...all[idx]!,
        ...payload,
      };
      all[idx] = updatedPolicy;
      setStoredPolicies(all);
      return updatedPolicy;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await apiClient.delete(`/warehouse-policies/${id}`);
    } catch {
      const all = getStoredPolicies();
      const filtered = all.filter((p) => p.id !== id);
      setStoredPolicies(filtered);
    }
  },
};
