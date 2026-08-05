import { apiClient } from '../api-client'

export interface MaintenanceScheduleDto {
  id: string
  workCenterCode: string
  equipmentName: string
  taskType: 'CALIBRATION' | 'PREVENTIVE' | 'OVERHAUL'
  lastCompletedDate: string
  nextDueDate: string
  status: 'SCHEDULED' | 'OVERDUE' | 'COMPLETED' | 'PAUSED'
  createdAt: string
  updatedAt: string
}

export interface CreateMaintenanceSchedulePayload {
  equipmentName: string
  workCenterCode: string
  taskType: 'CALIBRATION' | 'PREVENTIVE' | 'OVERHAUL'
  nextDueDate: string
}

export const maintenanceApi = {
  getAll: async (): Promise<MaintenanceScheduleDto[]> => {
    return apiClient.get<MaintenanceScheduleDto[]>('/maintenance-schedules')
  },
  getById: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.get<MaintenanceScheduleDto>(`/maintenance-schedules/${id}`)
  },
  create: async (payload: CreateMaintenanceSchedulePayload): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>('/maintenance-schedules', payload)
  },
  completeVisit: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(`/maintenance-schedules/${id}/complete-visit`, {})
  },
  pause: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(`/maintenance-schedules/${id}/pause`, {})
  },
  resume: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(`/maintenance-schedules/${id}/resume`, {})
  },
}
