import { apiClient } from "../api-client";

export interface InventoryProjectionDto {
  id: string;
  componentId: string;
  locationId: string;
  quantity: number;
  unitOfMeasure: string;
  lastUpdated: string;
}

export const inventoryProjectionsApi = {
  getByComponent: (componentId: string): Promise<InventoryProjectionDto[]> =>
    apiClient.get<InventoryProjectionDto[]>(
      `/inventory-projections/component/${componentId}`,
    ),
  getByLocation: (locationId: string): Promise<InventoryProjectionDto[]> =>
    apiClient.get<InventoryProjectionDto[]>(
      `/inventory-projections/location/${locationId}`,
    ),
  getByComponentAndLocation: (
    componentId: string,
    locationId: string,
  ): Promise<InventoryProjectionDto> =>
    apiClient.get<InventoryProjectionDto>(
      `/inventory-projections/query?componentId=${encodeURIComponent(
        componentId,
      )}&locationId=${encodeURIComponent(locationId)}`,
    ),
  rebuild: (): Promise<{ message: string }> =>
    apiClient.post<{ message: string }>("/inventory-projections/rebuild", {}),
};
