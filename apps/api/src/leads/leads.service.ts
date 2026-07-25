import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Lead, LeadRepository, LeadStatus, LeadSource } from '@ananya/crm';
import { CreateLeadDto, AssignLeadDto, DisqualifyLeadDto } from './dtos';
import { CrmAccountsService } from '../crm-accounts/crm-accounts.service';

export const LEAD_REPOSITORY = 'LEAD_REPOSITORY';

@Injectable()
export class LeadsService {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    private readonly crmAccountsService: CrmAccountsService,
  ) {}

  async create(dto: CreateLeadDto): Promise<Lead> {
    const leadNumber = await this.leadRepository.generateNextLeadNumber();
    const lead = Lead.create({
      leadNumber,
      name: dto.name,
      company: dto.company,
      email: dto.email,
      phone: dto.phone,
      source: dto.source,
      industry: dto.industry,
      owner: dto.owner,
    });
    await this.leadRepository.save(lead);
    return lead;
  }

  async findAll(
    status?: LeadStatus,
    source?: LeadSource,
    owner?: string,
    search?: string,
  ): Promise<Lead[]> {
    return this.leadRepository.findMany({ status, source, owner, search });
  }

  async findOne(id: string): Promise<Lead> {
    const lead = await this.leadRepository.findById(id);
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found.`);
    }
    return lead;
  }

  async assign(id: string, dto: AssignLeadDto): Promise<Lead> {
    const lead = await this.findOne(id);
    lead.assignOwner(dto.owner);
    await this.leadRepository.save(lead);
    return lead;
  }

  async qualify(id: string): Promise<Lead> {
    const lead = await this.findOne(id);
    lead.qualify();
    await this.leadRepository.save(lead);
    return lead;
  }

  async disqualify(id: string, dto: DisqualifyLeadDto): Promise<Lead> {
    const lead = await this.findOne(id);
    lead.disqualify(dto.reason);
    await this.leadRepository.save(lead);
    return lead;
  }

  async convert(id: string): Promise<Lead> {
    const lead = await this.findOne(id);

    // Create CrmAccount and primary Contact
    const account = await this.crmAccountsService.create({
      companyName: lead.company,
      industry: lead.industry,
    });

    const names = lead.name.split(' ');
    const firstName = names[0] || 'Unknown';
    const lastName = names.slice(1).join(' ') || 'Contact';

    await this.crmAccountsService.addContact(account.id, {
      firstName,
      lastName,
      email:
        lead.email ||
        `${firstName.toLowerCase()}@${lead.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      phone: lead.phone,
      role: 'DECISION_MAKER',
      isPrimary: true,
    });

    lead.convert(account.id);
    await this.leadRepository.save(lead);
    return lead;
  }
}
