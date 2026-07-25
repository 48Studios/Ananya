import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  WarrantyClaim,
  WarrantyClaimRepository,
  WarrantyDecision,
} from '@ananya/service';
import { CreateWarrantyClaimDto, DecisionNotesDto } from './dtos';
import { CustomersService } from '../customers/customers.service';
import { ComponentsService } from '../components/components.service';

export const WARRANTY_CLAIM_REPOSITORY = 'WARRANTY_CLAIM_REPOSITORY';

@Injectable()
export class WarrantyClaimsService {
  constructor(
    @Inject(WARRANTY_CLAIM_REPOSITORY)
    private readonly warrantyClaimRepository: WarrantyClaimRepository,
    private readonly customersService: CustomersService,
    private readonly componentsService: ComponentsService,
  ) {}

  async create(dto: CreateWarrantyClaimDto): Promise<WarrantyClaim> {
    await this.customersService.findOne(dto.customerId);
    await this.componentsService.getComponent(dto.productId);

    const warrantyNumber =
      await this.warrantyClaimRepository.generateNextWarrantyNumber();
    const claim = WarrantyClaim.create({
      warrantyNumber,
      customerId: dto.customerId,
      productId: dto.productId,
      serialNumber: dto.serialNumber,
      purchaseDate: new Date(dto.purchaseDate),
      expiryDate: new Date(dto.expiryDate),
      claimReason: dto.claimReason,
    });
    await this.warrantyClaimRepository.save(claim);
    return claim;
  }

  async findAll(
    customerId?: string,
    productId?: string,
    decision?: WarrantyDecision,
    search?: string,
  ): Promise<WarrantyClaim[]> {
    return this.warrantyClaimRepository.findMany({
      customerId,
      productId,
      decision,
      search,
    });
  }

  async findOne(id: string): Promise<WarrantyClaim> {
    const claim = await this.warrantyClaimRepository.findById(id);
    if (!claim) {
      throw new NotFoundException(`Warranty Claim with ID ${id} not found.`);
    }
    return claim;
  }

  async review(id: string): Promise<WarrantyClaim> {
    const claim = await this.findOne(id);
    claim.review();
    await this.warrantyClaimRepository.save(claim);
    return claim;
  }

  async approve(id: string, dto: DecisionNotesDto): Promise<WarrantyClaim> {
    const claim = await this.findOne(id);
    claim.approve(dto.notes);
    await this.warrantyClaimRepository.save(claim);
    return claim;
  }

  async reject(id: string, dto: DecisionNotesDto): Promise<WarrantyClaim> {
    const claim = await this.findOne(id);
    claim.reject(dto.notes);
    await this.warrantyClaimRepository.save(claim);
    return claim;
  }
}
