/**
 * Polymorphic component references (Pass 6B).
 *
 * Four tables reference a component through an `(entity_type, entity_id)` pair
 * instead of a foreign key, so the database cannot enforce them and the
 * dependency registry cannot discover them by inspecting constraints.
 *
 * The entity-type discriminator value is defined here once, because it is used
 * by the dependency registry, the consolidation preview, and the consolidation
 * adapter. If the application ever changes the discriminator, all three change
 * together.
 */

/** The `entity_type` value used when these tables reference a component. */
export const COMPONENT_ENTITY_TYPE = 'Component';

/**
 * Consolidation semantics for each polymorphic reference system.
 *
 * Defined explicitly in this pass based on what the record means, rather than
 * left as "unknown, therefore blocked".
 */
export type PolymorphicReferenceSemantics =
  'HISTORICAL_PRESERVE' | 'CURRENT_REPOINT' | 'CURRENT_RECONCILE';

export interface PolymorphicReferencePolicy {
  table: 'activity_events' | 'documents' | 'notifications' | 'user_favorites';
  semantics: PolymorphicReferenceSemantics;
  /** Why this table is treated this way. */
  rationale: string;
}

export const POLYMORPHIC_REFERENCE_POLICIES: readonly PolymorphicReferencePolicy[] =
  [
    {
      table: 'activity_events',
      semantics: 'HISTORICAL_PRESERVE',
      rationale:
        'An activity event records that something happened to a specific component at a specific time. Repointing it would rewrite the audit trail and make the event describe a record it never concerned.',
    },
    {
      table: 'notifications',
      semantics: 'HISTORICAL_PRESERVE',
      rationale:
        'A notification is a message a user was already shown, and the message text contains the component that it was about. It is a historical record of a communication, not a live pointer, so it keeps its original target.',
    },
    {
      table: 'documents',
      semantics: 'CURRENT_REPOINT',
      rationale:
        'Documents and attachments describe the entity they are filed against now. After consolidation the surviving component is that entity, so attachments follow it rather than being stranded on a retired record the UI will not surface.',
    },
    {
      table: 'user_favorites',
      semantics: 'CURRENT_RECONCILE',
      rationale:
        'A favorite is a live shortcut into the catalog. It must resolve to the component that still exists, and this schema has no unique constraint on (user, entity), so consolidation is what creates the risk of one part having two bookmarks. The duplicate source bookmark is removed rather than left behind.',
    },
  ];
