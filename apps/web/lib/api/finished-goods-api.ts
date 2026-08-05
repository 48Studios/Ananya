import { apiClient } from '../api-client'

export interface FinishedGoodDto {
  id: string
  sku: string
  name: string
  category: string
  quantityOnHand: number
  unitOfMeasure: string
  warehouseLocation: string
  unitCost: number
}

export const finishedGoodsApi = {
  getAll: async (): Promise<FinishedGoodDto[]> => {
    return apiClient.get<FinishedGoodDto[]>('/finished-goods')
  },
}
