import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CrmAccount, CrmAccountRepository } from '@ananya/crm';
import { CreateCrmAccountDto, AddContactDto } from './dtos';

export const CRM_ACCOUNT_REPOSITORY = 'CRM_ACCOUNT_REPOSITORY';

@Injectable()
export class CrmAccountsService {
  constructor(
    @Inject(CRM_ACCOUNT_REPOSITORY)
    private readonly crmAccountRepository: CrmAccountRepository,
  ) {}

  async create(dto: CreateCrmAccountDto): Promise<CrmAccount> {
    const account = CrmAccount.create({
      companyName: dto.companyName,
      industry: dto.industry,
      website: dto.website,
      billingAddress: dto.billingAddress,
      shippingAddress: dto.shippingAddress,
    });
    await this.crmAccountRepository.save(account);
    return account;
  }

  async findAll(isArchived?: boolean, search?: string): Promise<CrmAccount[]> {
    return this.crmAccountRepository.findMany({ isArchived, search });
  }

  async findOne(id: string): Promise<CrmAccount> {
    const account = await this.crmAccountRepository.findById(id);
    if (!account) {
      throw new NotFoundException(`CRM Account with ID ${id} not found.`);
    }
    return account;
  }

  async addContact(id: string, dto: AddContactDto): Promise<CrmAccount> {
    const account = await this.findOne(id);
    account.addContact(dto);
    await this.crmAccountRepository.save(account);
    return account;
  }

  async archive(id: string): Promise<CrmAccount> {
    const account = await this.findOne(id);
    account.archive();
    await this.crmAccountRepository.save(account);
    return account;
  }
}
