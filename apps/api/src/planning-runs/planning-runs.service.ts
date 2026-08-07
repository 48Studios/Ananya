import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  inventoryProjections,
  inventoryReservationLines,
  inventoryReservations,
} from '@ananya/database/schema';
import { and, eq, inArray, sql } from '@ananya/database/query';
import {
  PlanningRun,
  PlanningRunRepository,
  PlanningRunStatus,
  MaterialRequirement,
  MaterialRequirementRepository,
  PurchaseRecommendation,
  PurchaseRecommendationRepository,
  ProductionRecommendation,
  ProductionRecommendationRepository,
  PlanningMessage,
  PlanningMessageRepository,
} from '@ananya/mrp';
import { StartPlanningRunDto } from './dtos';
import { ComponentsService } from '../components/components.service';
import { BomsService } from '../boms/boms.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';

export const PLANNING_RUN_REPOSITORY = 'PLANNING_RUN_REPOSITORY';
export const MATERIAL_REQUIREMENT_REPOSITORY =
  'MATERIAL_REQUIREMENT_REPOSITORY';
export const PURCHASE_RECOMMENDATION_REPOSITORY =
  'PURCHASE_RECOMMENDATION_REPOSITORY';
export const PRODUCTION_RECOMMENDATION_REPOSITORY =
  'PRODUCTION_RECOMMENDATION_REPOSITORY';
export const PLANNING_MESSAGE_REPOSITORY = 'PLANNING_MESSAGE_REPOSITORY';

@Injectable()
export class PlanningRunsService {
  constructor(
    @Inject(PLANNING_RUN_REPOSITORY)
    private readonly planningRunRepository: PlanningRunRepository,
    @Inject(MATERIAL_REQUIREMENT_REPOSITORY)
    private readonly materialRequirementRepository: MaterialRequirementRepository,
    @Inject(PURCHASE_RECOMMENDATION_REPOSITORY)
    private readonly purchaseRecommendationRepository: PurchaseRecommendationRepository,
    @Inject(PRODUCTION_RECOMMENDATION_REPOSITORY)
    private readonly productionRecommendationRepository: ProductionRecommendationRepository,
    @Inject(PLANNING_MESSAGE_REPOSITORY)
    private readonly planningMessageRepository: PlanningMessageRepository,
    private readonly componentsService: ComponentsService,
    private readonly bomsService: BomsService,
    private readonly salesOrdersService: SalesOrdersService,
  ) {}

  async createAndExecute(dto: StartPlanningRunDto): Promise<PlanningRun> {
    const runNumber = await this.planningRunRepository.generateNextRunNumber();
    const run = PlanningRun.create({
      runNumber,
      horizonDays: dto.horizonDays,
      startedBy: dto.startedBy,
    });
    await this.planningRunRepository.save(run);

    run.start();
    await this.planningRunRepository.save(run);

    // MRP Engine Execution
    try {
      await this.executeMrpCalculation(run);
      run.complete();
    } catch (err: unknown) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'ERROR',
          message: `MRP calculation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }),
      );
      run.cancel();
    }

    await this.planningRunRepository.save(run);
    return run;
  }

  private async executeMrpCalculation(run: PlanningRun): Promise<void> {
    const allComponents = await this.componentsService.getAllComponents();
    const allBoms = await this.bomsService.findAll();
    const allSalesOrders = await this.salesOrdersService.findAll();
    const [projectionRows, reservationRows] = await Promise.all([
      db
        .select({
          componentId: inventoryProjections.componentId,
          availableQuantity: sql<string>`COALESCE(SUM(${inventoryProjections.quantity}), 0)`,
        })
        .from(inventoryProjections)
        .groupBy(inventoryProjections.componentId),
      db
        .select({
          componentId: inventoryReservationLines.componentId,
          reservedQuantity: sql<string>`COALESCE(SUM(${inventoryReservationLines.reservedQuantity} - ${inventoryReservationLines.fulfilledQuantity}), 0)`,
        })
        .from(inventoryReservationLines)
        .innerJoin(
          inventoryReservations,
          eq(inventoryReservationLines.reservationId, inventoryReservations.id),
        )
        .where(
          and(
            eq(inventoryReservations.status, 'ACTIVE'),
            inArray(inventoryReservations.reservationType, [
              'WORK_ORDER',
              'SALES_ORDER',
              'PROJECT',
            ]),
          ),
        )
        .groupBy(inventoryReservationLines.componentId),
    ]);

    await this.planningMessageRepository.save(
      PlanningMessage.create({
        planningRunId: run.id,
        severity: 'INFO',
        message: `Started MRP calculation run ${run.runNumber} for ${allComponents.length} components across ${run.horizonDays} days horizon.`,
      }),
    );

    const generatedRequirements: MaterialRequirement[] = [];
    const generatedPurchaseRecs: PurchaseRecommendation[] = [];
    const generatedProdRecs: ProductionRecommendation[] = [];
    const now = new Date();
    const horizonLimit = new Date(
      now.getTime() + run.horizonDays * 24 * 60 * 60 * 1000,
    );
    const releasedBomByProduct = new Map(
      allBoms
        .filter((bom) => bom.status === 'RELEASED')
        .map((bom) => [bom.componentId, bom]),
    );
    const componentById = new Map(
      allComponents.map((component) => [component.id, component]),
    );
    const availableByComponent = new Map(
      projectionRows.map((row) => [
        row.componentId,
        parseFloat(row.availableQuantity ?? '0'),
      ]),
    );
    const reservedByComponent = new Map(
      reservationRows.map((row) => [
        row.componentId,
        parseFloat(row.reservedQuantity ?? '0'),
      ]),
    );
    const requirementsByComponent = new Map<
      string,
      {
        requiredQuantity: number;
        requiredDate: Date;
        sourceReferenceId: string;
      }
    >();

    const demandOrders = allSalesOrders.filter((order) => {
      if (
        !['APPROVED', 'RELEASED', 'ALLOCATED', 'PARTIALLY_FULFILLED'].includes(
          order.status,
        )
      ) {
        return false;
      }

      const requiredDate = order.requiredDate ?? order.orderDate;
      return requiredDate <= horizonLimit;
    });

    for (const order of demandOrders) {
      const orderRequiredDate = order.requiredDate ?? order.orderDate;

      for (const line of order.lines) {
        const netDemand = Math.max(line.quantity - line.fulfilledQuantity, 0);
        if (netDemand <= 0) {
          continue;
        }

        const releasedBom = releasedBomByProduct.get(line.componentId);
        if (!releasedBom || releasedBom.lines.length === 0) {
          const current = requirementsByComponent.get(line.componentId);
          requirementsByComponent.set(line.componentId, {
            requiredQuantity: (current?.requiredQuantity ?? 0) + netDemand,
            requiredDate:
              current && current.requiredDate < orderRequiredDate
                ? current.requiredDate
                : orderRequiredDate,
            sourceReferenceId: order.id,
          });
          continue;
        }

        for (const bomLine of releasedBom.lines) {
          const grossRequirement =
            netDemand *
            bomLine.quantityPerUnit *
            (1 + bomLine.scrapFactorPercent / 100);
          const current = requirementsByComponent.get(bomLine.componentId);

          requirementsByComponent.set(bomLine.componentId, {
            requiredQuantity:
              (current?.requiredQuantity ?? 0) + grossRequirement,
            requiredDate:
              current && current.requiredDate < orderRequiredDate
                ? current.requiredDate
                : orderRequiredDate,
            sourceReferenceId: order.id,
          });
        }
      }
    }

    for (const [componentId, demand] of requirementsByComponent.entries()) {
      const req = MaterialRequirement.create({
        planningRunId: run.id,
        componentId,
        requiredQuantity: Math.round(demand.requiredQuantity * 10000) / 10000,
        availableQuantity: availableByComponent.get(componentId) ?? 0,
        reservedQuantity: reservedByComponent.get(componentId) ?? 0,
        requiredDate: demand.requiredDate,
        source: 'SALES_ORDER',
        sourceReferenceId: demand.sourceReferenceId,
      });
      generatedRequirements.push(req);

      if (req.shortageQuantity <= 0) {
        continue;
      }

      const manufacturedBom = releasedBomByProduct.get(componentId);
      if (manufacturedBom) {
        const suggestedCompletion = demand.requiredDate;
        const suggestedStart = new Date(
          suggestedCompletion.getTime() - 7 * 24 * 60 * 60 * 1000,
        );

        generatedProdRecs.push(
          ProductionRecommendation.create({
            planningRunId: run.id,
            productId: componentId,
            suggestedQuantity: req.shortageQuantity,
            suggestedStart,
            suggestedCompletion,
          }),
        );
      } else {
        const component = componentById.get(componentId);

        generatedPurchaseRecs.push(
          PurchaseRecommendation.create({
            planningRunId: run.id,
            componentId,
            suggestedQuantity: req.shortageQuantity,
            requiredDate: demand.requiredDate,
            recommendationReason: component
              ? `Projected shortage of ${req.shortageQuantity} ${component.unit} for ${component.sku}.`
              : `Projected shortage of ${req.shortageQuantity} units.`,
          }),
        );
      }
    }

    // Save outputs
    if (generatedRequirements.length > 0) {
      await this.materialRequirementRepository.saveMany(generatedRequirements);
    }
    if (generatedPurchaseRecs.length > 0) {
      await this.purchaseRecommendationRepository.saveMany(
        generatedPurchaseRecs,
      );
    }
    if (generatedProdRecs.length > 0) {
      await this.productionRecommendationRepository.saveMany(generatedProdRecs);
    }

    await this.planningMessageRepository.save(
      PlanningMessage.create({
        planningRunId: run.id,
        severity: 'INFO',
        message: `Generated ${generatedRequirements.length} requirements, ${generatedPurchaseRecs.length} purchase recommendations, and ${generatedProdRecs.length} production recommendations.`,
      }),
    );

    if (generatedProdRecs.length > 0) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'WARNING',
          message:
            'Capacity plans were not generated because no work-center master data is available for this planning run.',
        }),
      );
    }
  }

  async findAll(
    status?: PlanningRunStatus,
    startedBy?: string,
    search?: string,
  ): Promise<PlanningRun[]> {
    return this.planningRunRepository.findMany({ status, startedBy, search });
  }

  async findOne(id: string): Promise<PlanningRun> {
    const run = await this.planningRunRepository.findById(id);
    if (!run) {
      throw new NotFoundException(`Planning Run with ID ${id} not found.`);
    }
    return run;
  }

  async cancel(id: string): Promise<PlanningRun> {
    const run = await this.findOne(id);
    run.cancel();
    await this.planningRunRepository.save(run);
    return run;
  }
}
