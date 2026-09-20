import { db, type DbExecutor } from '@ananya/database';
import { DrizzleComponentRepository } from '../infrastructure/repositories/drizzle-component.repository';

/**
 * Guards component-selection paths against retired (consolidated) components.
 *
 * Consolidation retires a duplicate component without deleting it: the record
 * stays queryable and keeps its history, but it must no longer take part in new
 * operational activity. The `Component` aggregate owns that rule
 * (`assertCanCreateTransaction`), and this helper is what makes it reachable
 * from the services that accept a caller-supplied component id.
 *
 * Scope is deliberately narrow: it refuses a CONSOLIDATED component and does
 * nothing else. A missing component is left to the existing validation and
 * foreign keys, and a manually deactivated component keeps whatever behaviour it
 * had before, so wiring this in cannot change any pre-existing outcome.
 *
 * Reads use the global client by default; callers already inside a transaction
 * pass their executor so the guard sees the same snapshot as the write it
 * protects.
 */
export async function assertComponentUsableForNewActivity(
  componentId: string,
  context: string,
  client: DbExecutor = db,
): Promise<void> {
  const components = new DrizzleComponentRepository(client);
  const component = await components.findById(componentId);

  // Absence is not this guard's concern.
  if (!component) return;

  try {
    component.assertCanCreateTransaction();
  } catch (error) {
    // Re-thrown with the calling context so the operator can tell which
    // operation was refused, not only which component.
    throw new ComponentRetiredForNewActivityError(
      component.sku,
      component.consolidatedIntoComponentId,
      context,
      error,
    );
  }
}

/**
 * Raised when a retired component is selected for new operational activity.
 *
 * Wraps the aggregate's error rather than replacing it, so the original
 * `ComponentConsolidatedError` remains the cause and the domain vocabulary is
 * unchanged.
 */
export class ComponentRetiredForNewActivityError extends Error {
  constructor(
    public readonly sku: string,
    public readonly consolidatedIntoComponentId: string | null,
    public readonly context: string,
    cause: unknown,
  ) {
    super(
      `Component ${sku} was consolidated into another component and cannot be used for ${context}. Use the surviving component instead.`,
    );
    this.name = 'ComponentRetiredForNewActivityError';
    this.cause = cause;
  }
}
