import type { DbExecutor } from '@ananya/database';
import { sql } from '@ananya/database/query';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';
import { COMPONENT_ENTITY_TYPE } from '../polymorphic-references';

/**
 * Polymorphic reference consolidation adapter (Blocker 3).
 *
 * Four tables reference components by `(entity_type, entity_id)` with no foreign
 * key. Phase 0 could not classify them; this pass defines each one explicitly,
 * based on what the record actually means in the domain:
 *
 * | table            | semantics   | consolidation action                     |
 * |------------------|-------------|------------------------------------------|
 * | `activity_events`| HISTORICAL  | preserve — the event says what happened   |
 * |                  |             | to *that* component at that time          |
 * | `notifications`  | HISTORICAL  | preserve — a notification is a record of  |
 * |                  |             | what a user was told, including the SKU   |
 * |                  |             | in its text                               |
 * | `documents`      | CURRENT     | repoint — an attachment belongs to the    |
 * |                  |             | entity it is filed against now            |
 * | `user_favorites` | CURRENT     | repoint, with deterministic deduplication |
 *
 * Favorites have no unique constraint in this schema, so consolidation is what
 * creates the risk of a user holding both the source and the canonical favorite.
 * The resolver is deliberately explicit: keep the canonical favorite, drop the
 * source favorite, and never leave the user with a bookmark to a retired
 * component.
 *
 * Anything outside these four tables is NOT handled here. An unclassified
 * polymorphic reference stays BLOCKING, because a reference this adapter does not
 * recognise is a reference nobody has reasoned about.
 */
export class PolymorphicConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'polymorphic';
  readonly label = 'Polymorphic references';
  readonly order = 60;

  /** Tables this adapter owns, and whether consolidation repoints them. */
  static readonly HANDLED_TABLES = [
    'activity_events',
    'documents',
    'notifications',
    'user_favorites',
  ] as const;

  /** Tables preserved as historical context. */
  static readonly PRESERVED_TABLES = [
    'activity_events',
    'notifications',
  ] as const;

  /** Tables whose current reference follows the surviving component. */
  static readonly REPOINTED_TABLES = ['documents', 'user_favorites'] as const;

  apply(context: ConsolidationContext): Promise<ConsolidationAdapterOutcome> {
    return this.run(context);
  }

  private async run(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, executor } = context;

    const preserved: Array<{
      table: string;
      componentId: string;
      count: number;
    }> = [];
    const repointed: Array<{
      table: string;
      componentId: string;
      count: number;
      ids: string[];
    }> = [];
    const reconciledFavorites: Array<{
      userId: string;
      droppedFavoriteId: string;
      keptFavoriteId: string | null;
    }> = [];
    const warnings: string[] = [];

    for (const source of sources) {
      for (const table of PolymorphicConsolidationAdapter.PRESERVED_TABLES) {
        const count = await this.count(table, source.id, executor);
        if (count > 0) {
          preserved.push({ table, componentId: source.id, count });
        }
      }

      for (const table of PolymorphicConsolidationAdapter.REPOINTED_TABLES) {
        const ids = await this.ids(table, source.id, executor);
        if (ids.length === 0) continue;

        repointed.push({
          table,
          componentId: source.id,
          count: ids.length,
          ids,
        });
      }

      // Favorites need reconciliation rather than a plain update: the user may
      // already have bookmarked the canonical component.
      const dropped = await this.reconcileFavorites(
        source.id,
        canonical.id,
        canonical.sku,
        `/components/${canonical.id}`,
        executor,
      );
      reconciledFavorites.push(...dropped);

      // Documents follow the surviving component.
      await executor.execute(
        sql`update documents set entity_id = ${canonical.id}, updated_at = now() where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${source.id}`,
      );
    }

    if (preserved.some((entry) => entry.table === 'activity_events')) {
      warnings.push(
        'Historical activity events and notifications still reference the retired component. This is intentional: they record what happened at the time and are never rewritten.',
      );
    }
    if (reconciledFavorites.length > 0) {
      warnings.push(
        `${reconciledFavorites.length} user favorite(s) already pointed at the surviving component; the duplicate bookmark to the retired component was removed instead of creating two entries for one part.`,
      );
    }

    const migratedCount = repointed.reduce(
      (total, entry) => total + entry.count,
      0,
    );

    return {
      entity: 'polymorphic_references',
      action: migratedCount > 0 ? 'REPOINT' : 'NONE',
      migratedCount,
      details: {
        preservedReferences: preserved,
        repointedReferences: repointed,
        reconciledFavorites,
      },
      warnings,
    };
  }

  /**
   * Repoints a user's favorite from the retired component to the surviving one,
   * removing the source bookmark when the user already has the canonical one.
   *
   * Deterministic and lossless for the user's intent: they end up with exactly
   * one favorite for the part, pointing at the record that exists.
   */
  private async reconcileFavorites(
    sourceComponentId: string,
    canonicalComponentId: string,
    canonicalTitle: string,
    canonicalHref: string,
    executor: DbExecutor,
  ): Promise<
    Array<{
      userId: string;
      droppedFavoriteId: string;
      keptFavoriteId: string | null;
    }>
  > {
    const sourceFavorites = await executor.execute<{
      id: string;
      user_id: string | null;
    }>(
      sql`select id, user_id from user_favorites where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${sourceComponentId} order by id`,
    );

    const reconciled: Array<{
      userId: string;
      droppedFavoriteId: string;
      keptFavoriteId: string | null;
    }> = [];

    for (const favorite of sourceFavorites.rows) {
      const userId = favorite.user_id;
      if (!userId) {
        // A favorite with no owner cannot be meaningfully reconciled; removing
        // it would discard data, so it is repointed like any other.
        await this.repointFavorite(
          favorite.id,
          canonicalComponentId,
          canonicalTitle,
          canonicalHref,
          executor,
        );
        continue;
      }

      const existing = await executor.execute<{ id: string }>(
        sql`select id from user_favorites where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${canonicalComponentId} and user_id = ${userId} order by id limit 1`,
      );
      const keptFavoriteId = existing.rows[0]?.id ?? null;

      if (keptFavoriteId) {
        // The user already has a bookmark for the surviving component, and it
        // already carries that component's title and href. The source bookmark
        // is removed so the part has exactly one favorite.
        await executor.execute(
          sql`delete from user_favorites where id = ${favorite.id}`,
        );
      } else {
        await this.repointFavorite(
          favorite.id,
          canonicalComponentId,
          canonicalTitle,
          canonicalHref,
          executor,
        );
      }

      reconciled.push({
        userId,
        droppedFavoriteId: favorite.id,
        keptFavoriteId,
      });
    }

    return reconciled;
  }

  /**
   * Moves a favorite onto the surviving component.
   *
   * `title` and `href` are denormalized display data — the sidebar renders them
   * and links to `href` — so repointing only `entity_id` would leave a bookmark
   * that names the retired component and navigates to it. They are rewritten
   * together so the favorite resolves to the record that still exists.
   */
  private async repointFavorite(
    favoriteId: string,
    canonicalComponentId: string,
    canonicalTitle: string,
    canonicalHref: string,
    executor: DbExecutor,
  ): Promise<void> {
    await executor.execute(
      sql`update user_favorites set entity_id = ${canonicalComponentId}, title = ${canonicalTitle}, href = ${canonicalHref} where id = ${favoriteId}`,
    );
  }

  private async count(
    table: string,
    componentId: string,
    executor: DbExecutor,
  ): Promise<number> {
    const rows = await executor.execute<{ total: number }>(
      sql`select count(*)::int as total from ${sql.identifier(table)} where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${String(componentId)}`,
    );
    return Number(rows.rows[0]?.total ?? 0);
  }

  private async ids(
    table: string,
    componentId: string,
    executor: DbExecutor,
  ): Promise<string[]> {
    const rows = await executor.execute<{ id: string }>(
      sql`select id from ${sql.identifier(table)} where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${String(componentId)} order by id`,
    );
    return rows.rows.map((row) => row.id);
  }
}
