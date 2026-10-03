import * as path from 'path';
import * as dotenv from 'dotenv';

// apps/api/test/integration -> repository root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { closeDatabaseConnection, db } from '@ananya/database';
import {
  billOfMaterials,
  customers,
  inventoryProjections,
  inventoryReservationLines,
  inventoryReservations,
  locations,
  materialRequirements,
  planningMessages,
  planningRuns,
  salesOrders,
} from '@ananya/database/schema';
import { eq, inArray } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { BomsService } from '../../src/boms/boms.service';
import { ComponentsService } from '../../src/components/components.service';
import { CustomersService } from '../../src/customers/customers.service';
import { PlanningRunsService } from '../../src/planning-runs/planning-runs.service';
import { SalesOrdersService } from '../../src/sales-orders/sales-orders.service';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * MRP planning runs — lifecycle, calculation, persistence and API contract.
 *
 * The regression these tests pin down: MRP aggregates are class instances with
 * private storage fields, and every controller returns them directly. NestJS
 * serializes them with `JSON.stringify`, so without a public `toJSON` the wire
 * payload contains `_horizonDays`, `_status`, `_severity`, `_completedAt` while
 * the UI reads `horizonDays`, `status`, `severity`, `completedAt`. These tests
 * assert the HTTP payload, not the domain getters, because the payload is what
 * the UI actually consumes.
 *
 * The calculation fixture is a two-level BOM:
 *
 *   assembly (10 demanded)
 *     └─ 2 x sub-assembly
 *          └─ 3 x purchased part, 10% scrap
 *
 * with 6 purchased parts on hand and 2 reserved, plus one fully covered part.
 * Expected netting:
 *
 *   assembly      10 required, 0 supply  → production recommendation 10
 *   sub-assembly  20 required, 0 supply  → production recommendation 20
 *   purchased     66 required, 4 net     → purchase recommendation 62
 *   covered part   3 required, 100 stock → no requirement shortage
 */
describe('MRP planning runs', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const owner = new FixtureOwner('mrp-runs');

  let app: INestApplication;
  let authToken = '';
  let planningRunsService: PlanningRunsService;
  let salesOrdersService: SalesOrdersService;

  let assembly: { id: string };
  let subAssembly: { id: string };
  let purchasedPart: { id: string };
  let coveredPart: { id: string };

  const createdRunIds: string[] = [];
  const createdSalesOrderIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdBomIds: string[] = [];
  const createdReservationIds: string[] = [];
  const createdLocationIds: string[] = [];

  let mainRunId = '';

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function authed() {
    return { Authorization: `Bearer ${authToken}` };
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const authService = app.get(AuthService);
    const rolesService = app.get(RolesService);
    const usersService = app.get(UsersService);
    const componentsService = app.get(ComponentsService);
    const bomsService = app.get(BomsService);
    const customersService = app.get(CustomersService);
    salesOrdersService = app.get(SalesOrdersService);
    planningRunsService = app.get(PlanningRunsService);

    const role = await owner.createRole(rolesService, [
      'WorkOrders.Manage',
      'PurchaseOrders.Read',
    ]);
    const user = await owner.createUser(usersService, role.id, 'mrp-planner');
    authToken = (await authService.createSessionForUser(user.id)).token;

    assembly = await owner.createComponent(
      componentsService,
      { unit: 'pcs' },
      'MRP-ASM',
    );
    subAssembly = await owner.createComponent(
      componentsService,
      { unit: 'pcs' },
      'MRP-SUB',
    );
    purchasedPart = await owner.createComponent(
      componentsService,
      { unit: 'pcs' },
      'MRP-BUY',
    );
    coveredPart = await owner.createComponent(
      componentsService,
      { unit: 'pcs' },
      'MRP-COVERED',
    );

    const assemblyBom = await bomsService.create({
      componentId: assembly.id,
      revision: 'v1.0',
      lines: [
        {
          componentId: subAssembly.id,
          quantityPerUnit: 2,
          unitOfMeasure: 'pcs',
        },
      ],
    });
    createdBomIds.push(assemblyBom.id);
    await bomsService.release(assemblyBom.id);

    const subAssemblyBom = await bomsService.create({
      componentId: subAssembly.id,
      revision: 'v1.0',
      lines: [
        {
          componentId: purchasedPart.id,
          quantityPerUnit: 3,
          unitOfMeasure: 'pcs',
          scrapFactorPercent: 10,
        },
      ],
    });
    createdBomIds.push(subAssemblyBom.id);
    await bomsService.release(subAssemblyBom.id);

    const requiredDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const customer = await customersService.create({
      name: owner.name('MRP Demand Customer'),
      email: owner.email('mrp-demand'),
    });
    createdCustomerIds.push(customer.id);
    await customersService.activate(customer.id);

    const salesOrder = await salesOrdersService.create({
      customerId: customer.id,
      requiredDate: requiredDate.toISOString(),
    });
    createdSalesOrderIds.push(salesOrder.id);
    await salesOrdersService.addLine(salesOrder.id, {
      componentId: assembly.id,
      quantity: 10,
      unitPrice: 100,
    });
    await salesOrdersService.addLine(salesOrder.id, {
      componentId: coveredPart.id,
      quantity: 3,
      unitPrice: 10,
    });
    await salesOrdersService.approve(salesOrder.id);
    await salesOrdersService.release(salesOrder.id);

    const [stockLocation] = await db
      .insert(locations)
      .values({
        code: owner.upperCode('MRP-LOC'),
        name: owner.name('MRP Stock Location'),
        kind: 'BIN',
      })
      .returning();
    if (!stockLocation) {
      throw new Error('Failed to create the MRP stock location fixture.');
    }
    createdLocationIds.push(stockLocation.id);

    await db.insert(inventoryProjections).values([
      {
        componentId: purchasedPart.id,
        locationId: stockLocation.id,
        quantity: 6,
        unitOfMeasure: 'pcs',
      },
      {
        componentId: coveredPart.id,
        locationId: stockLocation.id,
        quantity: 100,
        unitOfMeasure: 'pcs',
      },
    ]);

    const [reservation] = await db
      .insert(inventoryReservations)
      .values({
        reservationNumber: owner.upperCode('MRP-RES'),
        reservationType: 'SALES_ORDER',
        reservedBy: 'e2e-mrp',
        status: 'ACTIVE',
      })
      .returning();
    if (!reservation) {
      throw new Error('Failed to create the MRP reservation fixture.');
    }
    createdReservationIds.push(reservation.id);
    await db.insert(inventoryReservationLines).values({
      reservationId: reservation.id,
      componentId: purchasedPart.id,
      locationId: stockLocation.id,
      reservedQuantity: '2',
      fulfilledQuantity: '0',
      unitOfMeasure: 'pcs',
    });
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    if (createdRunIds.length > 0) {
      await db
        .delete(planningRuns)
        .where(inArray(planningRuns.id, createdRunIds));
    }
    if (createdSalesOrderIds.length > 0) {
      await db
        .delete(salesOrders)
        .where(inArray(salesOrders.id, createdSalesOrderIds));
    }
    // Customers are created by this suite (SalesOrders reference them), so they
    // must be removed too, after the orders that reference them.
    if (createdCustomerIds.length > 0) {
      await db
        .delete(customers)
        .where(inArray(customers.id, createdCustomerIds));
    }
    if (createdBomIds.length > 0) {
      await db
        .delete(billOfMaterials)
        .where(inArray(billOfMaterials.id, createdBomIds));
    }
    if (createdReservationIds.length > 0) {
      await db
        .delete(inventoryReservations)
        .where(inArray(inventoryReservations.id, createdReservationIds));
    }
    if (createdLocationIds.length > 0) {
      await db
        .delete(inventoryProjections)
        .where(inArray(inventoryProjections.locationId, createdLocationIds));
      await db
        .delete(locations)
        .where(inArray(locations.id, createdLocationIds));
    }

    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('rejects a zero-day and an unowned planning horizon before creating a run', async () => {
    if (!hasDbUrl) return;

    const zeroHorizon = await http()
      .post('/planning-runs')
      .set(authed())
      .send({ horizonDays: 0, startedBy: 'e2e-mrp' });
    expect(zeroHorizon.status).toBe(400);

    const missingOwner = await http()
      .post('/planning-runs')
      .set(authed())
      .send({ horizonDays: 30, startedBy: '' });
    expect(missingOwner.status).toBe(400);
  });

  it('executes the planning core through the API with a real horizon and timestamps', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post('/planning-runs')
      .set(authed())
      .send({ horizonDays: 30, startedBy: 'e2e-mrp' });

    expect(response.status).toBe(201);
    const body = response.body as Record<string, unknown>;

    expect(Object.keys(body).filter((key) => key.startsWith('_'))).toEqual([]);
    expect(body.horizonDays).toBe(30);
    expect(body.status).toBe('COMPLETED');
    expect(body.startedBy).toBe('e2e-mrp');
    expect(typeof body.completedAt).toBe('string');
    expect(typeof body.createdAt).toBe('string');
    expect(typeof body.runNumber).toBe('string');

    mainRunId = body.id as string;
    createdRunIds.push(mainRunId);
  });

  it('returns the persisted run through the detail endpoint with a plain contract', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .get(`/planning-runs/${mainRunId}`)
      .set(authed());

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(Object.keys(body).filter((key) => key.startsWith('_'))).toEqual([]);
    expect(body.horizonDays).toBe(30);
    expect(body.status).toBe('COMPLETED');
    expect(body.completedAt).toBeTruthy();
    expect(body.createdAt).toBeTruthy();
  });

  it('persists retrieval-ready planning messages for the run id', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .get(`/planning-messages?planningRunId=${mainRunId}`)
      .set(authed());

    expect(response.status).toBe(200);
    const messages = response.body as Array<Record<string, unknown>>;
    expect(messages.length).toBeGreaterThanOrEqual(2);

    for (const message of messages) {
      expect(Object.keys(message).filter((key) => key.startsWith('_'))).toEqual(
        [],
      );
      expect(message.planningRunId).toBe(mainRunId);
      expect(['INFO', 'WARNING', 'ERROR']).toContain(message.severity);
      expect(typeof message.message).toBe('string');
      expect((message.message as string).trim().length).toBeGreaterThan(0);
      expect(message.createdAt).toBeTruthy();
    }

    const started = messages.find((message) =>
      (message.message as string).includes('Started MRP calculation run'),
    );
    expect(started).toBeDefined();
    expect(started?.message).toContain('30 days horizon');
  });

  it('explodes nested BOMs, applies scrap and nets on-hand and reserved stock', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .get(`/material-requirements?planningRunId=${mainRunId}`)
      .set(authed());
    expect(response.status).toBe(200);

    const requirements = response.body as Array<Record<string, unknown>>;
    const byComponent = new Map(
      requirements.map((requirement) => [
        requirement.componentId as string,
        requirement,
      ]),
    );

    const assemblyRequirement = byComponent.get(assembly.id);
    expect(assemblyRequirement?.requiredQuantity).toBe(10);
    expect(assemblyRequirement?.availableQuantity).toBe(0);
    expect(assemblyRequirement?.shortageQuantity).toBe(10);

    const subAssemblyRequirement = byComponent.get(subAssembly.id);
    expect(subAssemblyRequirement?.requiredQuantity).toBe(20);
    expect(subAssemblyRequirement?.shortageQuantity).toBe(20);

    const purchasedRequirement = byComponent.get(purchasedPart.id);
    expect(purchasedRequirement?.requiredQuantity).toBe(66);
    expect(purchasedRequirement?.availableQuantity).toBe(6);
    expect(purchasedRequirement?.reservedQuantity).toBe(2);
    expect(purchasedRequirement?.shortageQuantity).toBe(62);

    const coveredRequirement = byComponent.get(coveredPart.id);
    expect(coveredRequirement?.requiredQuantity).toBe(3);
    expect(coveredRequirement?.availableQuantity).toBe(100);
    expect(coveredRequirement?.shortageQuantity).toBe(0);

    const shortagesOnly = await http()
      .get(
        `/material-requirements?planningRunId=${mainRunId}&onlyShortages=true`,
      )
      .set(authed());
    expect(shortagesOnly.status).toBe(200);
    expect(
      (shortagesOnly.body as Array<Record<string, unknown>>).map(
        (requirement) => requirement.componentId,
      ),
    ).not.toContain(coveredPart.id);
  });

  it('produces make recommendations for manufactured items and buy recommendations for purchased items', async () => {
    if (!hasDbUrl) return;

    const productionResponse = await http()
      .get(`/production-recommendations?planningRunId=${mainRunId}`)
      .set(authed());
    expect(productionResponse.status).toBe(200);
    const production = productionResponse.body as Array<
      Record<string, unknown>
    >;
    const productionByProduct = new Map(
      production.map((recommendation) => [
        recommendation.productId as string,
        recommendation,
      ]),
    );
    expect(productionByProduct.get(assembly.id)?.suggestedQuantity).toBe(10);
    expect(productionByProduct.get(subAssembly.id)?.suggestedQuantity).toBe(20);
    expect(productionByProduct.get(purchasedPart.id)).toBeUndefined();

    const purchaseResponse = await http()
      .get(`/purchase-recommendations?planningRunId=${mainRunId}`)
      .set(authed());
    expect(purchaseResponse.status).toBe(200);
    const purchases = purchaseResponse.body as Array<Record<string, unknown>>;
    expect(purchases).toHaveLength(1);
    const purchase = purchases[0];
    expect(purchase?.componentId).toBe(purchasedPart.id);
    expect(purchase?.suggestedQuantity).toBe(62);
    expect(purchase?.status).toBe('PENDING');
    expect(typeof purchase?.recommendationReason).toBe('string');
  });

  it('keeps the run filter when a message severity filter is also present', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .get(`/planning-messages?planningRunId=${mainRunId}&severity=INFO`)
      .set(authed());

    expect(response.status).toBe(200);
    const messages = response.body as Array<Record<string, unknown>>;
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.planningRunId).toBe(mainRunId);
      expect(message.severity).toBe('INFO');
    }
  });

  it('completes a zero-demand horizon honestly instead of as a failure', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post('/planning-runs')
      .set(authed())
      .send({ horizonDays: 1, startedBy: 'e2e-mrp' });

    expect(response.status).toBe(201);
    const body = response.body as Record<string, unknown>;
    const zeroRunId = body.id as string;
    createdRunIds.push(zeroRunId);

    expect(body.status).toBe('COMPLETED');
    expect(body.horizonDays).toBe(1);
    expect(body.completedAt).toBeTruthy();

    const requirements = await http()
      .get(`/material-requirements?planningRunId=${zeroRunId}`)
      .set(authed());
    expect(requirements.status).toBe(200);
    expect(requirements.body).toEqual([]);

    const messages = await http()
      .get(`/planning-messages?planningRunId=${zeroRunId}`)
      .set(authed());
    const texts = (messages.body as Array<Record<string, unknown>>).map(
      (message) => message.message as string,
    );
    expect(
      texts.some((text) => text.includes('No open sales-order demand')),
    ).toBe(true);
  });

  it('cancels a failed run, records the diagnostic and never marks it COMPLETED', async () => {
    if (!hasDbUrl) return;

    const failure = jest
      .spyOn(salesOrdersService, 'findAll')
      .mockRejectedValueOnce(new Error('sales order feed unavailable'));

    try {
      const run = await planningRunsService.createAndExecute({
        horizonDays: 30,
        startedBy: 'e2e-mrp',
      });
      createdRunIds.push(run.id);

      expect(run.status).toBe('CANCELLED');
      expect(run.completedAt).toBeUndefined();

      const messages = await db
        .select()
        .from(planningMessages)
        .where(eq(planningMessages.planningRunId, run.id));
      const errorMessage = messages.find(
        (message) => message.severity === 'ERROR',
      );
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.message).toContain('MRP calculation failed');
      expect(errorMessage?.message).toContain('sales order feed unavailable');

      const requirements = await db
        .select()
        .from(materialRequirements)
        .where(eq(materialRequirements.planningRunId, run.id));
      expect(requirements).toEqual([]);

      const persisted = await db
        .select()
        .from(planningRuns)
        .where(eq(planningRuns.id, run.id));
      expect(persisted[0]?.status).toBe('CANCELLED');
    } finally {
      failure.mockRestore();
    }
  });
});
