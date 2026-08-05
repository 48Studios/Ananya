import { apiClient } from "../api-client";

export interface CustomerDto {
  id: string;
  customerNumber: string;
  name: string;
  email?: string | null;
  status: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  customerNumber: string;
  name: string;
  email?: string;
  currency?: string;
}

export const customersApi = {
  getAll: (): Promise<CustomerDto[]> =>
    apiClient.get<CustomerDto[]>("/customers"),
  getById: (id: string): Promise<CustomerDto> =>
    apiClient.get<CustomerDto>(`/customers/${id}`),
  create: (payload: CreateCustomerPayload): Promise<CustomerDto> =>
    apiClient.post<CustomerDto, CreateCustomerPayload>("/customers", payload),
};
