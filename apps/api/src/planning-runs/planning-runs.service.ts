import { Injectable, Inject, NotFoundException } from '@nestjs/common';
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
  CapacityPlan,
  CapacityPlanRepository,
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
export const CAPACITY_PLAN_REPOSITORY = 'CAPACITY_PLAN_REPOSITORY';
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
    @Inject(CAPACITY_PLAN_REPOSITORY)
    private readonly capacityPlanRepository: CapacityPlanRepository,
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

    // Analyze sales orders & component stock
    for (const comp of allComponents) {
      const isManufactured = allBoms.some((b) => b.componentId === comp.id);

      // Simple mock/sample calculation for net shortage
      const reqQty = 50;
      const availQty = 20;
      const resQty = 5;

      const req = MaterialRequirement.create({
        planningRunId: run.id,
        componentId: comp.id,
        requiredQuantity: reqQty,
        availableQuantity: availQty,
        reservedQuantity: resQty,
        requiredDate: new Date(Date.now() + 14 * 86400000),
        source: 'SALES_ORDER',
        sourceReferenceId: allSalesOrders[0]?.id,
      });
      generatedRequirements.push(req);

      if (req.shortageQuantity > 0) {
        if (isManufactured) {
          const prodRec = ProductionRecommendation.create({
            planningRunId: run.id,
            productId: comp.id,
            suggestedQuantity: req.shortageQuantity,
            suggestedStart: new Date(Date.now() + 2 * 86400000),
            suggestedCompletion: new Date(Date.now() + 12 * 86400000),
            manufacturingRoute: 'ROUTE-DEFAULT',
          });
          generatedProdRecs.push(prodRec);
        } else {
          const purchRec = PurchaseRecommendation.create({
            planningRunId: run.id,
            componentId: comp.id,
            suggestedQuantity: req.shortageQuantity,
            requiredDate: new Date(Date.now() + 14 * 86400000),
            recommendationReason: `Net shortage of ${req.shortageQuantity} units for component ${comp.name}.`,
          });
          generatedPurchaseRecs.push(purchRec);
        }
      }
    }

    // Capacity planning analysis
    const capacityPlan = CapacityPlan.create({
      planningRunId: run.id,
      workCenterId: 'wc-assembly-1',
      workCenterName: 'Main Assembly Work Center',
      availableCapacityHours: 160,
      plannedCapacityHours: generatedProdRecs.length * 20 + 40,
    });

    // Save outputs
    await this.materialRequirementRepository.saveMany(generatedRequirements);
    await this.purchaseRecommendationRepository.saveMany(generatedPurchaseRecs);
    await this.productionRecommendationRepository.saveMany(generatedProdRecs);
    await this.capacityPlanRepository.save(capacityPlan);

    await this.planningMessageRepository.save(
      PlanningMessage.create({
        planningRunId: run.id,
        severity: 'INFO',
        message: `Generated ${generatedRequirements.length} requirements, ${generatedPurchaseRecs.length} purchase recommendations, and ${generatedProdRecs.length} production recommendations.`,
      }),
    );

    if (capacityPlan.isOverloaded) {
      await this.planningMessageRepository.save(
        PlanningMessage.create({
          planningRunId: run.id,
          severity: 'WARNING',
          message: `Work Center ${capacityPlan.workCenterName} is overloaded (${capacityPlan.utilizationPercentage}%).`,
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
