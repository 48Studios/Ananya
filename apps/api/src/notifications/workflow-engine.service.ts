import { Injectable, Logger } from '@nestjs/common';
import { db } from '@ananya/database';
import { workflows, workflowExecutions } from '@ananya/database/schema';
import { eq, and } from '@ananya/database/query';
import { NotificationsService } from './notifications.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { CreateWorkflowDto, EvaluateWorkflowDto } from './dtos';

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async createWorkflow(dto: CreateWorkflowDto, userId?: string) {
    const [wf] = await db
      .insert(workflows)
      .values({
        name: dto.name,
        description: dto.description || '',
        triggerType: dto.triggerType,
        conditionsJson: dto.conditionsJson || [],
        actionsJson: dto.actionsJson || [],
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        createdById: userId || null,
      })
      .returning();

    await this.auditService.record({
      action: 'WORKFLOW_CREATED',
      category: 'WorkflowAutomation',
      userId,
      details: {
        workflowId: wf!.id,
        name: wf!.name,
        triggerType: wf!.triggerType,
      },
    });

    return wf;
  }

  async getWorkflows() {
    return db.select().from(workflows).orderBy(workflows.createdAt);
  }

  async evaluateTriggers(dto: EvaluateWorkflowDto) {
    const activeRules = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.triggerType, dto.triggerType),
          eq(workflows.isActive, true),
        ),
      );

    const results: Array<{
      workflowId: string;
      executed: boolean;
      logs: string[];
    }> = [];

    for (const rule of activeRules) {
      const logs: string[] = [];
      logs.push(
        `Evaluating workflow rule '${rule.name}' for trigger ${dto.triggerType}`,
      );

      // Evaluate conditions
      let conditionsPassed = true;
      for (const cond of rule.conditionsJson || []) {
        const val = dto.contextData[cond.field];
        if (cond.operator === 'EQUALS' && val !== cond.value) {
          conditionsPassed = false;
          logs.push(
            `Condition failed: ${cond.field} (${safeStr(val)}) != ${safeStr(cond.value)}`,
          );
          break;
        } else if (
          cond.operator === 'GREATER_THAN' &&
          Number(val) <= Number(cond.value)
        ) {
          conditionsPassed = false;
          logs.push(
            `Condition failed: ${cond.field} (${safeStr(val)}) <= ${safeStr(cond.value)}`,
          );
          break;
        }
      }

      if (conditionsPassed) {
        logs.push('All rule conditions passed. Executing workflow actions.');
        for (const action of rule.actionsJson || []) {
          if (action.actionType === 'CREATE_NOTIFICATION') {
            const payload = action.payload || {};
            const modVal = safeStr(payload.module) || 'Workflow';
            const typeVal = safeStr(payload.type) || 'INFO';
            const titleVal =
              safeStr(payload.title) || `Workflow Alert: ${rule.name}`;
            const msgVal =
              safeStr(payload.message) ||
              `Automated alert triggered by ${dto.triggerType}`;
            const prioVal = safeStr(payload.priority) || 'NORMAL';

            await this.notificationsService.createNotification({
              module: modVal,
              type: typeVal,
              title: titleVal,
              message: msgVal,
              priority: prioVal,
            });
            logs.push(`Action executed: Created Notification '${titleVal}'`);
          }
        }

        // Record Execution Log
        await db.insert(workflowExecutions).values({
          workflowId: rule.id,
          status: 'SUCCESS',
          triggeredBy: dto.triggerType,
          logsJson: logs.map((m) => ({
            timestamp: new Date().toISOString(),
            message: m,
          })),
        });

        results.push({ workflowId: rule.id, executed: true, logs });
      } else {
        results.push({ workflowId: rule.id, executed: false, logs });
      }
    }

    return { evaluatedRulesCount: activeRules.length, results };
  }
}
