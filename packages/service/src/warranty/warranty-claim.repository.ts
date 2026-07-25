import { WarrantyClaim, WarrantyDecision } from './warranty-claim';

export interface FindManyWarrantyClaimsOptions {
  customerId?: string;
  productId?: string;
  decision?: WarrantyDecision;
  search?: string;
}

export interface WarrantyClaimRepository {
  findById(id: string): Promise<WarrantyClaim | null>;
  findByNumber(warrantyNumber: string): Promise<WarrantyClaim | null>;
  findMany(options?: FindManyWarrantyClaimsOptions): Promise<WarrantyClaim[]>;
  save(claim: WarrantyClaim): Promise<void>;
  generateNextWarrantyNumber(): Promise<string>;
}
