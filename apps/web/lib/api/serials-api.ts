import { apiClient } from "../api-client";

export interface SerialDto {
  id: string;
  serialNumber: string;
  sku: string;
  componentName: string;
  status: "IN_STOCK" | "ASSIGNED" | "DISPATCHED" | "MAINTENANCE";
  location: string;
}

export interface CreateSerialPayload {
  serialNumber: string;
  sku: string;
  componentName: string;
  status?: "IN_STOCK" | "ASSIGNED" | "DISPATCHED" | "MAINTENANCE";
  location: string;
}

export interface UpdateSerialPayload {
  serialNumber?: string;
  sku?: string;
  componentName?: string;
  status?: "IN_STOCK" | "ASSIGNED" | "DISPATCHED" | "MAINTENANCE";
  location?: string;
}

const STORAGE_KEY = "ananya_serials_store";

const initialSerials: SerialDto[] = [
  {
    id: "ser-1",
    serialNumber: "SN-772910-A",
    sku: "COMP-1001",
    componentName: "Precision CNC Spindle Motor 5kW",
    status: "IN_STOCK",
    location: "Main Assembly WH / Bin A1-04",
  },
  {
    id: "ser-2",
    serialNumber: "SN-881023-B",
    sku: "COMP-1004",
    componentName: "Optical Encoder Sensor Array",
    status: "ASSIGNED",
    location: "Work Center 2 - Subassembly",
  },
];

function getStoredSerials(): SerialDto[] {
  if (typeof window === "undefined") return initialSerials;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialSerials));
    return initialSerials;
  }
  try {
    return JSON.parse(stored) as SerialDto[];
  } catch {
    return initialSerials;
  }
}

function setStoredSerials(serials: SerialDto[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serials));
  }
}

export const serialsApi = {
  getAll: async (): Promise<SerialDto[]> => {
    try {
      const remote = await apiClient.get<SerialDto[]>("/inventory/serials");
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch {
      // Fallback
    }
    return getStoredSerials();
  },

  create: async (payload: CreateSerialPayload): Promise<SerialDto> => {
    try {
      return await apiClient.post<SerialDto>("/inventory/serials", payload);
    } catch {
      const all = getStoredSerials();
      const newSerial: SerialDto = {
        id: `ser-${Date.now()}`,
        serialNumber: payload.serialNumber,
        sku: payload.sku,
        componentName: payload.componentName,
        status: payload.status ?? "IN_STOCK",
        location: payload.location,
      };
      const updated = [newSerial, ...all];
      setStoredSerials(updated);
      return newSerial;
    }
  },

  update: async (
    id: string,
    payload: UpdateSerialPayload,
  ): Promise<SerialDto> => {
    try {
      return await apiClient.put<SerialDto>(
        `/inventory/serials/${id}`,
        payload,
      );
    } catch {
      const all = getStoredSerials();
      const idx = all.findIndex((s) => s.id === id);
      if (idx === -1) throw new Error("Serial record not found");
      const updatedSerial: SerialDto = {
        ...all[idx]!,
        ...payload,
      };
      all[idx] = updatedSerial;
      setStoredSerials(all);
      return updatedSerial;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await apiClient.delete(`/inventory/serials/${id}`);
    } catch {
      const all = getStoredSerials();
      const filtered = all.filter((s) => s.id !== id);
      setStoredSerials(filtered);
    }
  },
};
