import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  ProductionRecommendation,
  ProductionRecommendationRepository,
  ProductionRecommendationStatus,
} from '@ananya/mrp';
import { CreateProductionRecommendationDto } from './dtos';

export const PRODUCTION_RECOMMENDATION_REPOSITORY =
  'PRODUCTION_RECOMMENDATION_REPOSITORY';

@Injectable()
export class ProductionRecommendationsService {
  constructor(
    @Inject(PRODUCTION_RECOMMENDATION_REPOSITORY)
    private readonly productionRecommendationRepository: ProductionRecommendationRepository,
  ) {}

  async create(
    dto: CreateProductionRecommendationDto,
  ): Promise<ProductionRecommendation> {
    const rec = ProductionRecommendation.create({
      planningRunId: dto.planningRunId,
      productId: dto.productId,
      suggestedQuantity: dto.suggestedQuantity,
      suggestedStart: new Date(dto.suggestedStart),
      suggestedCompletion: new Date(dto.suggestedCompletion),
      manufacturingRoute: dto.manufacturingRoute,
    });
    await this.productionRecommendationRepository.save(rec);
    return rec;
  }

  async findAll(
    planningRunId?: string,
    productId?: string,
    status?: ProductionRecommendationStatus,
  ): Promise<ProductionRecommendation[]> {
    return this.productionRecommendationRepository.findMany({
      planningRunId,
      productId,
      status,
    });
  }

  async findOne(id: string): Promise<ProductionRecommendation> {
    const rec = await this.productionRecommendationRepository.findById(id);
    if (!rec) {
      throw new NotFoundException(
        `Production Recommendation with ID ${id} not found.`,
      );
    }
    return rec;
  }

  async accept(id: string): Promise<ProductionRecommendation> {
    const rec = await this.findOne(id);
    rec.accept();
    await this.productionRecommendationRepository.save(rec);
    return rec;
  }

  async reject(id: string): Promise<ProductionRecommendation> {
    const rec = await this.findOne(id);
    rec.reject();
    await this.productionRecommendationRepository.save(rec);
    return rec;
  }

  async markImplemented(id: string): Promise<ProductionRecommendation> {
    const rec = await this.findOne(id);
    rec.markImplemented();
    await this.productionRecommendationRepository.save(rec);
    return rec;
  }
}
