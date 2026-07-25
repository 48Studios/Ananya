import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Opportunity,
  OpportunityRepository,
  OpportunityStage,
} from '@ananya/crm';
import {
  CreateOpportunityDto,
  AdvanceOpportunityStageDto,
  CloseOpportunityLostDto,
} from './dtos';
import { CrmAccountsService } from '../crm-accounts/crm-accounts.service';
import { CustomersService } from '../customers/customers.service';
import { QuotationsService } from '../quotations/quotations.service';

export const OPPORTUNITY_REPOSITORY = 'OPPORTUNITY_REPOSITORY';

export interface WinOpportunityResult {
  opportunity: Opportunity;
  customerId?: string;
  quotationId?: string;
}

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepository: OpportunityRepository,
    private readonly crmAccountsService: CrmAccountsService,
    private readonly customersService: CustomersService,
    private readonly quotationsService: QuotationsService,
  ) {}

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    await this.crmAccountsService.findOne(dto.crmAccountId);
    const opportunityNumber =
      await this.opportunityRepository.generateNextOpportunityNumber();
    const opportunity = Opportunity.create({
      opportunityNumber,
      name: dto.name,
      leadId: dto.leadId,
      crmAccountId: dto.crmAccountId,
      estimatedValue: dto.estimatedValue,
      expectedCloseDate: new Date(dto.expectedCloseDate),
      probability: dto.probability,
    });
    await this.opportunityRepository.save(opportunity);
    return opportunity;
  }

  async findAll(
    crmAccountId?: string,
    stage?: OpportunityStage,
    search?: string,
  ): Promise<Opportunity[]> {
    return this.opportunityRepository.findMany({
      crmAccountId,
      stage,
      search,
    });
  }

  async findOne(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findById(id);
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID ${id} not found.`);
    }
    return opportunity;
  }

  async advanceStage(
    id: string,
    dto: AdvanceOpportunityStageDto,
  ): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.advanceStage(dto.stage);
    await this.opportunityRepository.save(opportunity);
    return opportunity;
  }

  async win(id: string): Promise<WinOpportunityResult> {
    const opportunity = await this.findOne(id);
    opportunity.closeWon();
    await this.opportunityRepository.save(opportunity);

    let customerId: string | undefined;
    let quotationId: string | undefined;

    try {
      const crmAccount = await this.crmAccountsService.findOne(
        opportunity.crmAccountId,
      );

      // Check if a sales Customer already exists or create one
      const existingCustomers = await this.customersService.findAll(
        undefined,
        crmAccount.companyName,
      );
      let customer = existingCustomers[0];

      if (!customer) {
        const primaryContact = crmAccount.contacts.find((c) => c.isPrimary);
        const contactEmail =
          primaryContact?.email ||
          `billing@${crmAccount.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
        customer = await this.customersService.create({
          name: crmAccount.companyName,
          email: contactEmail,
          currency: 'USD',
        });
      }

      customerId = customer.id;

      // Generate Sales Quotation draft
      const quote = await this.quotationsService.create({
        customerId: customer.id,
      });

      quotationId = quote.id;
    } catch {
      // Ignore sales handoff errors if customer already exists or sales setup is pending
    }

    return { opportunity, customerId, quotationId };
  }

  async lose(id: string, dto: CloseOpportunityLostDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.closeLost(dto.reason);
    await this.opportunityRepository.save(opportunity);
    return opportunity;
  }
}
