import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Account, AccountRepository, AccountType } from '@ananya/finance';
import { CreateAccountDto } from './dtos';

export const ACCOUNT_REPOSITORY = 'ACCOUNT_REPOSITORY';

@Injectable()
export class AccountsService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
  ) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    const existing = await this.accountRepository.findByNumber(
      dto.accountNumber,
    );
    if (existing) {
      throw new BadRequestException(
        `Account with number ${dto.accountNumber} already exists.`,
      );
    }
    const account = Account.create({
      accountNumber: dto.accountNumber,
      name: dto.name,
      accountType: dto.accountType,
      parentAccountId: dto.parentAccountId,
      currency: dto.currency,
    });
    await this.accountRepository.save(account);
    return account;
  }

  async findAll(
    accountType?: AccountType,
    isActive?: boolean,
    search?: string,
  ): Promise<Account[]> {
    return this.accountRepository.findMany({ accountType, isActive, search });
  }

  async findOne(id: string): Promise<Account> {
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found.`);
    }
    return account;
  }

  async activate(id: string): Promise<Account> {
    const account = await this.findOne(id);
    account.activate();
    await this.accountRepository.save(account);
    return account;
  }

  async deactivate(id: string): Promise<Account> {
    const account = await this.findOne(id);
    account.deactivate();
    await this.accountRepository.save(account);
    return account;
  }
}
