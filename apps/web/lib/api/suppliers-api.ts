import { apiClient } from "../api-client";

export interface SupplierContactDto {
  id: string;
  supplierId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierComponentDto {
  id: string;
  supplierId: string;
  componentId: string;
  vendorPartNumber: string;
  leadTimeDays: number;
  minimumOrderQuantity: number;
  orderMultiple: number;
  unitPrice: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierDto {
  id: string;
  code: string;
  name: string;
  taxId?: string | null;
  paymentTerms: string;
  currency: string;
  rating: number;
  isActive: boolean;
  contacts?: SupplierContactDto[];
  components?: SupplierComponentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierPayload {
  code: string;
  name: string;
  taxId?: string | null;
  paymentTerms?: string;
  currency?: string;
}

export interface UpdateSupplierPayload {
  code?: string;
  name?: string;
  taxId?: string | null;
  paymentTerms?: string;
  currency?: string;
  isActive?: boolean;
}

export const suppliersApi = {
  getAll: (search?: string): Promise<SupplierDto[]> => {
    const url = search
      ? `/suppliers?search=${encodeURIComponent(search)}`
      : "/suppliers";
    return apiClient.get<SupplierDto[]>(url);
  },
  getById: (id: string): Promise<SupplierDto> =>
    apiClient.get<SupplierDto>(`/suppliers/${id}`),
  create: (payload: CreateSupplierPayload): Promise<SupplierDto> =>
    apiClient.post<SupplierDto, CreateSupplierPayload>("/suppliers", payload),
  update: (id: string, payload: UpdateSupplierPayload): Promise<SupplierDto> =>
    apiClient.put<SupplierDto, UpdateSupplierPayload>(
      `/suppliers/${id}`,
      payload,
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/suppliers/${id}`),
};
