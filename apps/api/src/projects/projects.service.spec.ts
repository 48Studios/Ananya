import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Project, ProjectRepository } from '@ananya/projects';
import { ProjectsService } from './projects.service';
import { CustomersService } from '../customers/customers.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

describe('ProjectsService Material Stock Integration', () => {
  let service: ProjectsService;
  let mockProjectRepo: jest.Mocked<ProjectRepository>;
  let mockCustomersService: jest.Mocked<CustomersService>;
  let mockSalesOrdersService: jest.Mocked<SalesOrdersService>;
  let mockInventoryTransactionsService: jest.Mocked<InventoryTransactionsService>;
  let mockInventoryProjectionsService: jest.Mocked<InventoryProjectionsService>;
  let dummyProject: Project;

  beforeEach(() => {
    dummyProject = Project.create({
      projectNumber: 'PRJ-2026-0001',
      name: 'Test Project',
      projectManager: 'PM-1',
      startDate: new Date('2026-01-01'),
      targetCompletionDate: new Date('2026-12-31'),
    });
    // Move project to ACTIVE status so it can issue and return
    dummyProject.start('Admin');

    mockProjectRepo = {
      findById: jest.fn().mockResolvedValue(dummyProject),
      save: jest.fn().mockImplementation(async (p) => p),
      findMany: jest.fn().mockResolvedValue([dummyProject]),
      generateNextProjectNumber: jest.fn().mockResolvedValue('PRJ-2026-0002'),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectRepository>;

    mockCustomersService = {
      findOne: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    } as unknown as jest.Mocked<CustomersService>;

    mockSalesOrdersService = {
      findOne: jest.fn().mockResolvedValue({ id: 'so-1' }),
    } as unknown as jest.Mocked<SalesOrdersService>;

    mockInventoryTransactionsService = {
      create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    } as unknown as jest.Mocked<InventoryTransactionsService>;

    mockInventoryProjectionsService = {
      getByComponentAndLocation: jest.fn().mockResolvedValue({
        id: 'proj-1',
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 100,
        unitOfMeasure: 'pcs',
        lastUpdated: new Date(),
      }),
      rebuild: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<InventoryProjectionsService>;

    service = new ProjectsService(
      mockProjectRepo,
      mockCustomersService,
      mockSalesOrdersService,
      mockInventoryTransactionsService,
      mockInventoryProjectionsService,
    );
  });

  describe('allocateMaterial', () => {
    it('allocates material when requested quantity <= available stock at location', async () => {
      const result = await service.allocateMaterial(dummyProject.id, {
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 40,
        unitOfMeasure: 'pcs',
        notes: 'For project assembly',
        performedBy: 'Alice',
      });

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0]?.allocatedQuantity).toBe(40);
      expect(mockProjectRepo.save).toHaveBeenCalled();
    });

    it('rejects allocation when requested quantity > available stock at location', async () => {
      mockInventoryProjectionsService.getByComponentAndLocation.mockResolvedValueOnce({
        id: 'proj-1',
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 10,
        unitOfMeasure: 'pcs',
        lastUpdated: new Date(),
      } as any);

      await expect(
        service.allocateMaterial(dummyProject.id, {
          componentId: 'comp-1',
          locationId: 'loc-1',
          quantity: 25,
          unitOfMeasure: 'pcs',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('issueMaterial', () => {
    beforeEach(async () => {
      // Allocate 50 units first
      await service.allocateMaterial(dummyProject.id, {
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 50,
        unitOfMeasure: 'pcs',
        performedBy: 'Alice',
      });
    });

    it('issues material, posts Issue ledger transaction, and rebuilds projections', async () => {
      const result = await service.issueMaterial(dummyProject.id, {
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 30,
        performedBy: 'Bob',
      });

      expect(result.materials[0]?.issuedQuantity).toBe(30);

      // Verifies inventory transaction is logged
      expect(mockInventoryTransactionsService.create).toHaveBeenCalledWith({
        transactionType: 'Issue',
        componentId: 'comp-1',
        sourceLocationId: 'loc-1',
        quantity: 30,
        unitOfMeasure: 'pcs',
        reference: dummyProject.projectNumber,
        reason: `Project material issue (${dummyProject.projectNumber})`,
        createdBy: 'Bob',
      });

      // Verifies stock projection rebuild is triggered
      expect(mockInventoryProjectionsService.rebuild).toHaveBeenCalled();
      expect(mockProjectRepo.save).toHaveBeenCalled();
    });

    it('rejects issuing when location physical stock has dropped below issue quantity', async () => {
      // Stock dropped to 15 on hand
      mockInventoryProjectionsService.getByComponentAndLocation.mockResolvedValueOnce({
        id: 'proj-1',
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 15,
        unitOfMeasure: 'pcs',
        lastUpdated: new Date(),
      } as any);

      await expect(
        service.issueMaterial(dummyProject.id, {
          componentId: 'comp-1',
          locationId: 'loc-1',
          quantity: 30,
          performedBy: 'Bob',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('returnMaterial', () => {
    beforeEach(async () => {
      // Allocate and issue 40 units
      await service.allocateMaterial(dummyProject.id, {
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 50,
        unitOfMeasure: 'pcs',
        performedBy: 'Alice',
      });
      await service.issueMaterial(dummyProject.id, {
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 40,
        performedBy: 'Alice',
      });
    });

    it('returns material, posts Return ledger transaction, and rebuilds projections', async () => {
      const result = await service.returnMaterial(dummyProject.id, {
        componentId: 'comp-1',
        locationId: 'loc-1',
        quantity: 15,
        performedBy: 'Charlie',
      });

      expect(result.materials[0]?.returnedQuantity).toBe(15);

      // Verifies inventory transaction is logged
      expect(mockInventoryTransactionsService.create).toHaveBeenCalledWith({
        transactionType: 'Return',
        componentId: 'comp-1',
        destinationLocationId: 'loc-1',
        quantity: 15,
        unitOfMeasure: 'pcs',
        reference: dummyProject.projectNumber,
        reason: `Project material return (${dummyProject.projectNumber})`,
        createdBy: 'Charlie',
      });

      // Verifies stock projection rebuild is triggered
      expect(mockInventoryProjectionsService.rebuild).toHaveBeenCalled();
      expect(mockProjectRepo.save).toHaveBeenCalled();
    });
  });
});
