import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Supplier,
  SupplierRepository,
  CreateSupplier,
  UpdateSupplier,
  DeleteSupplier,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from '@ananya/procurement';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  AddContactDto,
  MapComponentDto,
} from './dtos';

export const SUPPLIER_REPOSITORY = 'SUPPLIER_REPOSITORY';

@Injectable()
export class SuppliersService {
  private readonly createSupplier: CreateSupplier;
  private readonly updateSupplier: UpdateSupplier;
  private readonly deleteSupplier: DeleteSupplier;

  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: SupplierRepository,
  ) {
    this.createSupplier = new CreateSupplier(supplierRepository);
    this.updateSupplier = new UpdateSupplier(supplierRepository);
    this.deleteSupplier = new DeleteSupplier(supplierRepository);
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    const input: CreateSupplierInput = {
      code: dto.code,
      name: dto.name,
      taxId: dto.taxId,
      paymentTerms: dto.paymentTerms,
      currency: dto.currency,
    };
    return this.createSupplier.execute(input);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const input: UpdateSupplierInput = {
      code: dto.code,
      name: dto.name,
      taxId: dto.taxId,
      paymentTerms: dto.paymentTerms,
      currency: dto.currency,
      isActive: dto.isActive,
    };
    return this.updateSupplier.execute(id, input);
  }

  async delete(id: string): Promise<void> {
    return this.deleteSupplier.execute(id);
  }

  async findAll(search?: string): Promise<Supplier[]> {
    return this.supplierRepository.findMany({ search });
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found.`);
    }
    return supplier;
  }

  async addContact(supplierId: string, dto: AddContactDto): Promise<void> {
    await this.findOne(supplierId);
    await this.supplierRepository.addContact({
      supplierId,
      ...dto,
    });
  }

  async removeContact(supplierId: string, contactId: string): Promise<void> {
    await this.findOne(supplierId);
    await this.supplierRepository.deleteContact(supplierId, contactId);
  }

  async mapComponent(supplierId: string, dto: MapComponentDto): Promise<void> {
    await this.findOne(supplierId);
    await this.supplierRepository.mapComponent({
      supplierId,
      ...dto,
    });
  }

  async removeComponentMapping(
    supplierId: string,
    mappingId: string,
  ): Promise<void> {
    await this.findOne(supplierId);
    await this.supplierRepository.removeComponentMapping(supplierId, mappingId);
  }
}
