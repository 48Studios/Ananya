import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  PurchaseRecommendation,
  PurchaseRecommendationRepository,
  PurchaseRecommendationStatus,
} from '@ananya/mrp';
import { CreatePurchaseRecommendationDto } from './dtos';

export const PURCHASE_RECOMMENDATION_REPOSITORY =
  'PURCHASE_RECOMMENDATION_REPOSITORY';

@Injectable()
export class PurchaseRecommendationsService {
  constructor(
    @Inject(PURCHASE_RECOMMENDATION_REPOSITORY)
    private readonly purchaseRecommendationRepository: PurchaseRecommendationRepository,
  ) {}

  async create(
    dto: CreatePurchaseRecommendationDto,
  ): Promise<PurchaseRecommendation> {
    const rec = PurchaseRecommendation.create({
      planningRunId: dto.planningRunId,
      componentId: dto.componentId,
      supplierId: dto.supplierId,
      suggestedQuantity: dto.suggestedQuantity,
      requiredDate: new Date(dto.requiredDate),
      recommendationReason: dto.recommendationReason,
    });
    await this.purchaseRecommendationRepository.save(rec);
    return rec;
  }

  async findAll(
    planningRunId?: string,
    componentId?: string,
    supplierId?: string,
    status?: PurchaseRecommendationStatus,
  ): Promise<PurchaseRecommendation[]> {
    return this.purchaseRecommendationRepository.findMany({
      planningRunId,
      componentId,
      supplierId,
      status,
    });
  }

  async findOne(id: string): Promise<PurchaseRecommendation> {
    const rec = await this.purchaseRecommendationRepository.findById(id);
    if (!rec) {
      throw new NotFoundException(
        `Purchase Recommendation with ID ${id} not found.`,
      );
    }
    return rec;
  }

  async accept(id: string): Promise<PurchaseRecommendation> {
    const rec = await this.findOne(id);
    rec.accept();
    await this.purchaseRecommendationRepository.save(rec);
    return rec;
  }

  async reject(id: string): Promise<PurchaseRecommendation> {
    const rec = await this.findOne(id);
    rec.reject();
    await this.purchaseRecommendationRepository.save(rec);
    return rec;
  }

  async markImplemented(id: string): Promise<PurchaseRecommendation> {
    const rec = await this.findOne(id);
    rec.markImplemented();
    await this.purchaseRecommendationRepository.save(rec);
    return rec;
  }
}
