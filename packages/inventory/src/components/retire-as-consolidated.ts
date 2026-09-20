import { Component } from "./component";
import {
  ComponentNotFoundError,
  InvalidConsolidationTargetError,
} from "./component.errors";
import type { ComponentRepository } from "./component.repository";

export interface RetireAsConsolidatedCommand {
  /** The component being retired. */
  sourceComponentId: string;
  /** The component that survives. */
  canonicalComponentId: string;
  /** The consolidation operation performing the retirement. */
  consolidationId: string;
  /** When the retirement happened. Defaults to now. */
  consolidatedAt?: Date;
}

/**
 * Retires a source component as consolidated into a canonical component.
 *
 * This is the domain use case for the consolidation lifecycle transition. It
 * exists so the transition is a named domain operation rather than a boolean
 * mutation scattered across services, and so its invariants live in one place:
 *
 *  - the source must exist,
 *  - the canonical must exist and be a different record,
 *  - the canonical must still be ACTIVE (a consolidated component can never
 *    absorb another; that would create a chain with no unambiguous canonical),
 *  - the source must not already be consolidated.
 *
 * The caller is responsible for running this inside the consolidation
 * transaction and for having locked both components first. It performs no
 * locking itself so the same use case can be used with any repository binding.
 */
export class RetireAsConsolidated {
  constructor(private readonly components: ComponentRepository) {}

  async execute(command: RetireAsConsolidatedCommand): Promise<Component> {
    const source = await this.components.findById(command.sourceComponentId);

    if (!source) {
      throw new ComponentNotFoundError(command.sourceComponentId);
    }

    const canonical = await this.components.findById(
      command.canonicalComponentId,
    );

    if (!canonical) {
      throw new ComponentNotFoundError(command.canonicalComponentId);
    }

    if (canonical.isConsolidated) {
      throw new InvalidConsolidationTargetError(
        `Component '${canonical.sku}' was itself consolidated into another component and cannot be the canonical target of a new consolidation.`,
      );
    }

    if (!canonical.isActive) {
      throw new InvalidConsolidationTargetError(
        `Component '${canonical.sku}' is inactive and cannot absorb another component.`,
      );
    }

    // `retireAsConsolidated` owns the self-consolidation and
    // already-consolidated invariants.
    const retired = source.retireAsConsolidated({
      canonicalComponentId: command.canonicalComponentId,
      consolidationId: command.consolidationId,
      consolidatedAt: command.consolidatedAt,
    });

    return this.components.update(retired);
  }
}
