import { apiClient } from "../api-client";

export interface PurchaseInvoiceDto {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  poNumber: string;
  amount: number;
  dueDate: string;
  status: "PAID" | "UNPAID" | "PARTIAL";
}

export interface CreatePurchaseInvoicePayload {
  invoiceNumber: string;
  supplierName: string;
  poNumber: string;
  amount: number;
  dueDate: string;
  status?: "PAID" | "UNPAID" | "PARTIAL";
}

export interface UpdatePurchaseInvoicePayload {
  invoiceNumber?: string;
  supplierName?: string;
  poNumber?: string;
  amount?: number;
  dueDate?: string;
  status?: "PAID" | "UNPAID" | "PARTIAL";
}

const STORAGE_KEY = "ananya_purchase_invoices_store";

const initialInvoices: PurchaseInvoiceDto[] = [
  {
    id: "inv-1",
    invoiceNumber: "INV-SUP-901",
    supplierName: "Global Microelectronics Co.",
    poNumber: "PO-2026-042",
    amount: 18450,
    dueDate: "2026-02-28",
    status: "UNPAID",
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-SUP-902",
    supplierName: "Precision Steel Alloys",
    poNumber: "PO-2026-059",
    amount: 12900,
    dueDate: "2026-02-15",
    status: "PAID",
  },
];

function getStoredInvoices(): PurchaseInvoiceDto[] {
  if (typeof window === "undefined") return initialInvoices;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialInvoices));
    return initialInvoices;
  }
  try {
    return JSON.parse(stored) as PurchaseInvoiceDto[];
  } catch {
    return initialInvoices;
  }
}

function setStoredInvoices(invoices: PurchaseInvoiceDto[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }
}

export const purchaseInvoicesApi = {
  getAll: async (): Promise<PurchaseInvoiceDto[]> => {
    try {
      const remote = await apiClient.get<PurchaseInvoiceDto[]>(
        "/purchase-invoices",
      );
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch {
      // Fallback
    }
    return getStoredInvoices();
  },

  create: async (
    payload: CreatePurchaseInvoicePayload,
  ): Promise<PurchaseInvoiceDto> => {
    try {
      return await apiClient.post<PurchaseInvoiceDto>(
        "/purchase-invoices",
        payload,
      );
    } catch {
      const all = getStoredInvoices();
      const newInvoice: PurchaseInvoiceDto = {
        id: `inv-${Date.now()}`,
        invoiceNumber: payload.invoiceNumber,
        supplierName: payload.supplierName,
        poNumber: payload.poNumber,
        amount: payload.amount,
        dueDate: payload.dueDate,
        status: payload.status ?? "UNPAID",
      };
      const updated = [newInvoice, ...all];
      setStoredInvoices(updated);
      return newInvoice;
    }
  },

  update: async (
    id: string,
    payload: UpdatePurchaseInvoicePayload,
  ): Promise<PurchaseInvoiceDto> => {
    try {
      return await apiClient.put<PurchaseInvoiceDto>(
        `/purchase-invoices/${id}`,
        payload,
      );
    } catch {
      const all = getStoredInvoices();
      const idx = all.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error("Invoice not found");
      const updatedInvoice: PurchaseInvoiceDto = {
        ...all[idx]!,
        ...payload,
      };
      all[idx] = updatedInvoice;
      setStoredInvoices(all);
      return updatedInvoice;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await apiClient.delete(`/purchase-invoices/${id}`);
    } catch {
      const all = getStoredInvoices();
      const filtered = all.filter((i) => i.id !== id);
      setStoredInvoices(filtered);
    }
  },
};
