import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Quotation, QuotationRepository, QuotationStatus } from '@ananya/sales';
import { CreateQuotationDto, AddQuotationLineDto } from './dtos';
import { CustomersService } from '../customers/customers.service';

export const QUOTATION_REPOSITORY = 'QUOTATION_REPOSITORY';

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(QUOTATION_REPOSITORY)
    private readonly quotationRepository: QuotationRepository,
    private readonly customersService: CustomersService,
  ) {}

  async create(dto: CreateQuotationDto): Promise<Quotation> {
    const customer = await this.customersService.findOne(dto.customerId);
    if (customer.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Customer ${customer.name} is not ACTIVE. Cannot create quotation.`,
      );
    }
    const quoteNumber =
      await this.quotationRepository.generateNextQuoteNumber();
    const quotation = Quotation.create({
      quoteNumber,
      customerId: dto.customerId,
      currency: dto.currency || customer.currency,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
    });
    await this.quotationRepository.save(quotation);
    return quotation;
  }

  async findAll(
    customerId?: string,
    status?: QuotationStatus,
  ): Promise<Quotation[]> {
    return this.quotationRepository.findMany({ customerId, status });
  }

  async findOne(id: string): Promise<Quotation> {
    const quotation = await this.quotationRepository.findById(id);
    if (!quotation) {
      throw new NotFoundException(`Quotation with ID ${id} not found.`);
    }
    return quotation;
  }

  async addLine(id: string, dto: AddQuotationLineDto): Promise<Quotation> {
    const quotation = await this.findOne(id);
    quotation.addLine(dto);
    await this.quotationRepository.save(quotation);
    return quotation;
  }

  async send(id: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    quotation.send();
    await this.quotationRepository.save(quotation);
    return quotation;
  }

  async accept(id: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    quotation.accept();
    await this.quotationRepository.save(quotation);
    return quotation;
  }

  async cancel(id: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    quotation.cancel();
    await this.quotationRepository.save(quotation);
    return quotation;
  }
}
