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

function roundPlanningQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

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
    const [allComponents, allBoms, allSalesOrders] = await Promise.all([
      this.componentsService.getAllComponents(),
      this.bomsService.findAll(),
      this.salesOrdersService.findAll(),
    ]);
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

    const componentById = new Map(
      allComponents.map((component) => [component.id, component]),
    );
    const releasedBomByProduct = new Map(
      allBoms
        .filter((bom) => bom.status === 'RELEASED')
        .map((bom) => [bom.componentId, bom]),
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

    const now = new Date();
    const horizonLimit = new Date(
      now.getTime() + run.horizonDays * 24 * 60 * 60 * 1000,
    );
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

    const grossDemandByComponent = new Map<
      string,
      {
        quantity: number;
        requiredDate: Date;
        sourceReferenceId?: string;
      }
    >();
    const addGrossDemand = (
      componentId: string,
      quantity: number,
      requiredDate: Date,
      sourceReferenceId?: string,
    ): void => {
      const rounded = roundPlanningQuantity(quantity);
      if (rounded <= 0) return;

      const current = grossDemandByComponent.get(componentId);
      if (current) {
        current.quantity = roundPlanningQuantity(current.quantity + rounded);
        if (requiredDate < current.requiredDate) {
          current.requiredDate = requiredDate;
        }
        return;
      }

      grossDemandByComponent.set(componentId, {
        quantity: rounded,
        requiredDate,
        sourceReferenceId,
      });
    };

    for (const order of demandOrders) {
      const orderRequiredDate = order.requiredDate ?? order.orderDate;

      for (const line of order.lines) {
        const netDemand = Math.max(line.quantity - line.fulfilledQuantity, 0);
        addGrossDemand(
          line.componentId,
          netDemand,
          orderRequiredDate,
          order.id,
        );
      }
    }

    // Low-level coding: a component is netted only at its deepest occurrence in
    // the product structure. Parents then always have released their dependent
    // demand - exploded from their net shortage - before stock is applied.
    const lowLevelByComponent = new Map<string, number>();
    const cycleWarnings: string[] = [];
    const traversalQueue: Array<{
      componentId: string;
      level: number;
      path: string[];
    }> = [];

    for (const componentId of grossDemandByComponent.keys()) {
      lowLevelByComponent.set(componentId, 0);
      traversalQueue.push({ componentId, level: 0, path: [componentId] });
    }

    const expandedAtLevel = new Map<string, number>();
    const maxPlanningLevels = 25;
    while (traversalQueue.length > 0) {
      const current = traversalQueue.shift();
      if (!current) break;

      const previousExpansion = expandedAtLevel.get(current.componentId);
      if (
        previousExpansion !== undefined &&
        current.level <= previousExpansion
      ) {
        continue;
      }
      expandedAtLevel.set(current.componentId, current.level);
      if (current.level > (lowLevelByComponent.get(current.componentId) ?? 0)) {
        lowLevelByComponent.set(current.componentId, current.level);
      }

      const bom = releasedBomByProduct.get(current.componentId);
      if (!bom) continue;

      for (const bomLine of bom.lines) {
        if (current.path.includes(bomLine.componentId)) {
          cycleWarnings.push(
            `${[...current.path, bomLine.componentId].join(' -> ')} is a circular BOM dependency; it was planned as a single level.`,
          );
          continue;
        }
        if (current.level + 1 > maxPlanningLevels) {
          cycleWarnings.push(
            `BOM depth exceeded ${maxPlanningLevels} levels below ${current.path[0]}; deeper levels were not planned.`,
          );
          continue;
        }

        traversalQueue.push({
          componentId: bomLine.componentId,
          level: current.level + 1,
          path: [...current.path, bomLine.componentId],
        });
      }
    }

    const generatedRequirements: MaterialRequirement[] = [];
    const generatedPurchaseRecs: PurchaseRecommendation[] = [];
    const generatedProdRecs: ProductionRecommendation[] = [];
    const maxLevel = Math.max(0, ...lowLevelByComponent.values());

    for (let level = 0; level <= maxLevel; level += 1) {
      for (const [componentId, demand] of grossDemandByComponent) {
        if ((lowLevelByComponent.get(componentId) ?? 0) !== level) {
          continue;
        }

        const requirement = MaterialRequirement.create({
          planningRunId: run.id,
          componentId,
          requiredQuantity: demand.quantity,
          availableQuantity: availableByComponent.get(componentId) ?? 0,
          reservedQuantity: reservedByComponent.get(componentId) ?? 0,
          requiredDate: demand.requiredDate,
          source: 'SALES_ORDER',
          sourceReferenceId: demand.sourceReferenceId,
        });
        generatedRequirements.push(requirement);

        const shortage = roundPlanningQuantity(requirement.shortageQuantity);
        if (shortage <= 0) {
          continue;
        }

        const manufacturedBom = releasedBomByProduct.get(componentId);
        if (!manufacturedBom) {
          const component = componentById.get(componentId);

          generatedPurchaseRecs.push(
            PurchaseRecommendation.create({
              planningRunId: run.id,
              componentId,
              suggestedQuantity: shortage,
              requiredDate: demand.requiredDate,
              recommendationReason: component
                ? `Projected shortage of ${shortage} ${component.unit} for ${component.sku}.`
                : `Projected shortage of ${shortage} units.`,
            }),
          );
          continue;
        }

        generatedProdRecs.push(
          ProductionRecommendation.create({
            planningRunId: run.id,
            productId: componentId,
            suggestedQuantity: shortage,
            suggestedStart: new Date(
              demand.requiredDate.getTime() - 7 * 24 * 60 * 60 * 1000,
            ),
            suggestedCompletion: demand.requiredDate,
          }),
        );

        for (const bomLine of manufacturedBom.lines) {
          addGrossDemand(
            bomLine.componentId,
            shortage *
              bomLine.quantityPerUnit *
              (1 + bomLine.scrapFactorPercent / 100),
            demand.requiredDate,
            demand.sourceReferenceId,
          );
        }
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

    if (generatedRequirements.length === 0) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'INFO',
          message: `No open sales-order demand falls inside the ${run.horizonDays}-day planning horizon; the run completed with no material requirements.`,
        }),
      );
    } else if (
      generatedPurchaseRecs.length === 0 &&
      generatedProdRecs.length === 0
    ) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'INFO',
          message: `All ${generatedRequirements.length} gross requirements are covered by available inventory and reservations; no replenishment recommendations were required.`,
        }),
      );
    }

    for (const warning of cycleWarnings.slice(0, 3)) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'WARNING',
          message: warning,
        }),
      );
    }
    if (cycleWarnings.length > 3) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'WARNING',
          message: `${cycleWarnings.length} circular or over-deep BOM paths were detected; only the first 3 are listed.`,
        }),
      );
    }

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
