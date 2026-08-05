import { apiClient } from '../api-client'

export interface ServiceRequestDto {
  id: string
  ticketNumber: string
  customerName: string
  assetName: string
  issueSubject: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  createdDate: string
  createdAt: string
  updatedAt: string
}

export const serviceRequestsApi = {
  getAll: async (): Promise<ServiceRequestDto[]> => {
    return apiClient.get<ServiceRequestDto[]>('/service-requests')
  },
  getById: async (id: string): Promise<ServiceRequestDto> => {
    return apiClient.get<ServiceRequestDto>(`/service-requests/${id}`)
  },
}
