import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Customer,
  CustomerRepository,
  CustomerStatus,
  CustomerContactProps,
  CustomerAddressProps,
} from '@ananya/sales';
import {
  CreateCustomerDto,
  AddCustomerContactDto,
  AddCustomerAddressDto,
} from './dtos';

export const CUSTOMER_REPOSITORY = 'CUSTOMER_REPOSITORY';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: CustomerRepository,
  ) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const customerNumber =
      await this.customerRepository.generateNextCustomerNumber();
    const customer = Customer.create({
      customerNumber,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      taxId: dto.taxId,
      currency: dto.currency,
    });
    await this.customerRepository.save(customer);
    return customer;
  }

  async findAll(status?: CustomerStatus, search?: string): Promise<Customer[]> {
    return this.customerRepository.findMany({ status, search });
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found.`);
    }
    return customer;
  }

  async activate(id: string): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.activate();
    await this.customerRepository.save(customer);
    return customer;
  }

  async suspend(id: string): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.suspend();
    await this.customerRepository.save(customer);
    return customer;
  }

  async addContact(
    id: string,
    dto: AddCustomerContactDto,
  ): Promise<CustomerContactProps> {
    const customer = await this.findOne(id);
    const contact = customer.addContact(dto);
    await this.customerRepository.save(customer);
    return contact;
  }

  async addAddress(
    id: string,
    dto: AddCustomerAddressDto,
  ): Promise<CustomerAddressProps> {
    const customer = await this.findOne(id);
    const address = customer.addAddress(dto);
    await this.customerRepository.save(customer);
    return address;
  }
}
