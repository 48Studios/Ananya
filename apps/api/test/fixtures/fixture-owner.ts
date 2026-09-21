import { db } from '@ananya/database';
import {
  activityEvents,
  aiSuggestionFeedback,
  attributeDefinitions,
  attributeIntelligenceFindings,
  categories,
  componentIntelligenceFindings,
  components,
  roles,
  securityAuditLogs,
  users,
} from '@ananya/database/schema';
import { ilike, inArray, or, sql } from '@ananya/database/query';

/**
 * Fixture ownership and cleanup for integration suites.
 *
 * Pass 6. Before this, every suite re-implemented its own `afterAll` with
 * hand-written `DELETE`s, and the result was a class of leak rather than an
 * instance of one: the full integration run left several hundred audit rows, a
 * few hundred orphaned activity events, and stray component/finding/feedback
 * fixtures behind, and each new suite had to rediscover which rows its fixtures
 * had produced. Three separate suites leaked in Pass 5 alone.
 *
 * The rule this encodes: **a fixture is owned by the thing that created it, and
 * cleanup removes exactly the owned ids.** Nothing is matched by timestamp, and
 * nothing is swept because it merely looks orphaned.
 *
 * ```ts
 * const owner = new FixtureOwner('attr-queue');
 * const role = await owner.createRole(rolesService, ['Inventory.Read']);
 * const user = await owner.createUser(usersService, role.id);
 * const component = await owner.createComponent(componentsService);
 * // ... test ...
 * const removed = await owner.cleanup();
 * ```
 *
 * ### What cleanup can and cannot see
 *
 * Two identifier shapes exist in `security_audit_logs`, and both are handled:
 *
 *  - Rows that name an **actor** (`user_id` / `user_email`). `USER_CREATED`,
 *    `LOGIN_SUCCESS`, `PASSWORD_CHANGED` and every domain write land here.
 *  - Rows that name **only a subject** — `ROLE_CREATED`, `ROLE_UPDATED` and
 *    `ROLE_DELETED` carry `user_id = NULL` AND `user_email = NULL`, with the role
 *    id buried in `details->>'roleId'`. These were invisible to every previous
 *    cleanup, which is why dozens of rows per suite run accumulated.
 *
 * Cleanup is therefore three predicates, not one: tracked actor ids, tracked actor
 * emails, and tracked role ids found in the details blob.
 *
 * ### Why not orphan sweeping
 *
 * Deleting activity events whose subject no longer exists is tempting and wrong:
 * it cannot tell a test fixture from a legitimate historical event whose entity
 * was later deleted in normal use. Activity cleanup here removes only events whose
 * `entity_id` is one of this owner's tracked fixture ids.
 */
export class FixtureOwner {
  /**
   * Unique tag for this owner's fixtures.
   *
   * Embedded in every code, name and email so a leaked row is identifiable by
   * inspection, and so two suites running against the same database cannot collide
   * on a unique constraint.
   */
  readonly runTag: string;

  private readonly userIds = new Set<string>();
  private readonly roleIds = new Set<string>();
  private readonly componentIds = new Set<string>();
  private readonly attributeDefinitionIds = new Set<string>();
  private readonly categoryIds = new Set<string>();
  private readonly findingIds = new Set<string>();
  private readonly componentFindingIds = new Set<string>();
  private readonly feedbackIds = new Set<string>();
  private readonly activityEventIds = new Set<string>();
  private readonly emails = new Set<string>();
  /**
   * Monotonic counter for created fixtures.
   *
   * The run tag alone is not enough: one owner creates several roles, several
   * users and several components, and every one of those tables has a unique
   * constraint on its code/name/sku. Without a discriminator the second
   * `createRole` collides with the first — which is exactly what happened the first
   * time this helper was used.
   */
  private sequence = 0;
  private cleanedUp = false;

  constructor(label: string) {
    // Base-36 so the tag stays short: `components.sku` is capped at 50 characters
    // by its DTO, and the tag plus a descriptive prefix has to fit inside it.
    this.runTag = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // -------------------------------------------------------------------------
  // Naming
  // -------------------------------------------------------------------------

  /**
   * A fixture code, namespaced by the owner tag and truncated to a column limit.
   *
   * The default limit is 50 because that is the tightest code column a fixture
   * typically lands in (`components.sku`). Pass a larger value for a table with
   * more room.
   */
  code(prefix: string, maxLength = 50): string {
    return `${prefix}-${this.runTag}`.slice(0, maxLength);
  }

  /** An uppercase variant, for tables whose codes are conventionally uppercase. */
  upperCode(prefix: string, maxLength = 50): string {
    return this.code(prefix, maxLength).toUpperCase();
  }

  /** A fixture name, namespaced by the owner tag. */
  name(prefix: string): string {
    return `${prefix} ${this.runTag}`;
  }

  /** The next discriminator, so each created fixture is unique within the owner. */
  private nextSuffix(): string {
    this.sequence += 1;
    return `-${this.sequence}`;
  }

  /** A fixture email that the owner can later match on. */
  email(prefix: string): string {
    const address = `${prefix}-${this.runTag}@ananya.local`;
    this.emails.add(address);
    return address;
  }

  // -------------------------------------------------------------------------
  // Tracking
  // -------------------------------------------------------------------------

  trackUser(id: string): string {
    this.userIds.add(id);
    return id;
  }

  trackRole(id: string): string {
    this.roleIds.add(id);
    return id;
  }

  trackComponent(id: string): string {
    this.componentIds.add(id);
    return id;
  }

  trackAttributeDefinition(id: string): string {
    this.attributeDefinitionIds.add(id);
    return id;
  }

  trackCategory(id: string): string {
    this.categoryIds.add(id);
    return id;
  }

  /** Tracks an attribute-intelligence finding. */
  trackFinding(id: string): string {
    this.findingIds.add(id);
    return id;
  }

  /** Tracks a component-intelligence finding. */
  trackComponentFinding(id: string): string {
    this.componentFindingIds.add(id);
    return id;
  }

  trackFeedback(id: string): string {
    this.feedbackIds.add(id);
    return id;
  }

  trackActivityEvent(id: string): string {
    this.activityEventIds.add(id);
    return id;
  }

  /** An email already recorded by {@link email}, for ad-hoc actors. */
  trackEmail(email: string): string {
    this.emails.add(email);
    return email;
  }

  /** Read-only view of what this owner has accumulated. */
  get tracked(): Record<string, number> {
    return {
      users: this.userIds.size,
      roles: this.roleIds.size,
      components: this.componentIds.size,
      attributeDefinitions: this.attributeDefinitionIds.size,
      categories: this.categoryIds.size,
      findings: this.findingIds.size,
      componentFindings: this.componentFindingIds.size,
      feedback: this.feedbackIds.size,
      activityEvents: this.activityEventIds.size,
    };
  }

  // -------------------------------------------------------------------------
  // Creation helpers
  //
  // Structural types rather than imports of the services, so this module does not
  // depend on the modules that use it and a suite can pass a spy or a stub.
  // -------------------------------------------------------------------------

  async createRole(
    rolesService: {
      create: (input: {
        name: string;
        description?: string;
        permissions: string[];
      }) => Promise<{ id: string; name: string }>;
    },
    permissions: string[],
    description = 'Integration fixture',
  ): Promise<{ id: string; name: string }> {
    const role = await rolesService.create({
      name: this.name(`E2E Fixture Role${this.nextSuffix()}`),
      description,
      permissions,
    });
    this.trackRole(role.id);
    return role;
  }

  async createUser(
    usersService: {
      create: (input: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        roleId: string;
      }) => Promise<{ id: string; email: string }>;
    },
    roleId: string,
    prefix = 'e2e-fixture',
  ): Promise<{ id: string; email: string }> {
    const user = await usersService.create({
      email: this.email(prefix),
      password: 'FixturePassw0rd!',
      firstName: 'E2E',
      lastName: 'Fixture',
      roleId,
    });
    this.trackUser(user.id);
    return user;
  }

  /**
   * Creates and tracks a component.
   *
   * Returns the whole created row rather than a narrowed shape, because callers
   * need fields the owner does not care about — `updatedAt` in particular, which
   * component findings carry as the revision they were generated against.
   */
  async createComponent<T extends { id: string }>(
    componentsService: { create: (input: never) => Promise<T> },
    overrides: Record<string, unknown> = {},
    prefix = 'E2E',
  ): Promise<T> {
    const suffix = this.nextSuffix();
    const component = await componentsService.create({
      sku: this.upperCode(`${prefix}${suffix}`),
      name: this.name(`E2E Fixture Component${suffix}`),
      ...overrides,
    } as never);
    this.trackComponent(component.id);
    return component;
  }

  async createCategory(
    categoriesService: {
      create: (input: {
        code: string;
        name: string;
      }) => Promise<{ id: string }>;
    },
    prefix = 'E2E-CAT',
  ): Promise<{ id: string }> {
    const suffix = this.nextSuffix();
    const category = await categoriesService.create({
      code: this.upperCode(`${prefix}${suffix}`),
      name: this.name(`E2E Fixture Category${suffix}`),
    });
    this.trackCategory(category.id);
    return category;
  }

  async createAttributeDefinition(
    attributesService: {
      createDefinition: (
        input: Record<string, unknown>,
      ) => Promise<{ id: string; code: string }>;
    },
    overrides: Record<string, unknown> = {},
    prefix = 'e2e_attr',
  ): Promise<{ id: string; code: string }> {
    const suffix = this.nextSuffix();
    const definition = await attributesService.createDefinition({
      code: this.code(`${prefix}${suffix}`),
      name: this.name(`E2E Fixture Attribute${suffix}`),
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
      ...overrides,
    });
    this.trackAttributeDefinition(definition.id);
    return definition;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Removes everything this owner created, in foreign-key order.
   *
   * Order is load-bearing, not cosmetic:
   *
   *  1. findings first — their subject columns cascade or set null with the rows
   *     below, so removing them first keeps the rest deterministic;
   *  2. feedback — `attribute_definition_id` / `category_id` / `component_id` are
   *     ON DELETE SET NULL, so a feedback row must go BEFORE the subject it names
   *     or it becomes unaddressable and leaks;
   *  3. activity events and audit rows — they reference subjects by id in text or
   *     jsonb, so they must go before the subjects;
   *  4. components, attribute definitions, categories;
   *  5. users, then roles (users reference roles).
   */
  async cleanup(): Promise<CleanupReport> {
    const report: CleanupReport = {
      findings: 0,
      componentFindings: 0,
      feedback: 0,
      activityEvents: 0,
      auditLogs: 0,
      components: 0,
      attributeDefinitions: 0,
      categories: 0,
      users: 0,
      roles: 0,
    };

    const findingIds = [...this.findingIds];
    const componentFindingIds = [...this.componentFindingIds];
    const feedbackIds = [...this.feedbackIds];
    const componentIds = [...this.componentIds];
    const definitionIds = [...this.attributeDefinitionIds];
    const categoryIds = [...this.categoryIds];
    const userIds = [...this.userIds];
    const roleIds = [...this.roleIds];
    const emails = [...this.emails];

    // 1. Findings, by explicit id and by subject — a suite may persist a finding
    //    through a service that returns the row without the caller tracking it.
    if (findingIds.length > 0) {
      report.findings += await countRemoved(
        db
          .delete(attributeIntelligenceFindings)
          .where(inArray(attributeIntelligenceFindings.id, findingIds))
          .returning({ id: attributeIntelligenceFindings.id }),
      );
    }
    if (definitionIds.length > 0) {
      report.findings += await countRemoved(
        db
          .delete(attributeIntelligenceFindings)
          .where(
            inArray(
              attributeIntelligenceFindings.attributeDefinitionId,
              definitionIds,
            ),
          )
          .returning({ id: attributeIntelligenceFindings.id }),
      );
      report.findings += await countRemoved(
        db
          .delete(attributeIntelligenceFindings)
          .where(
            inArray(
              attributeIntelligenceFindings.relatedAttributeDefinitionId,
              definitionIds,
            ),
          )
          .returning({ id: attributeIntelligenceFindings.id }),
      );
    }
    if (categoryIds.length > 0) {
      report.findings += await countRemoved(
        db
          .delete(attributeIntelligenceFindings)
          .where(inArray(attributeIntelligenceFindings.categoryId, categoryIds))
          .returning({ id: attributeIntelligenceFindings.id }),
      );
    }

    // 2. Component findings, by id and by subject component.
    if (componentFindingIds.length > 0) {
      report.componentFindings += await countRemoved(
        db
          .delete(componentIntelligenceFindings)
          .where(inArray(componentIntelligenceFindings.id, componentFindingIds))
          .returning({ id: componentIntelligenceFindings.id }),
      );
    }
    if (componentIds.length > 0) {
      report.componentFindings += await countRemoved(
        db
          .delete(componentIntelligenceFindings)
          .where(
            inArray(componentIntelligenceFindings.componentId, componentIds),
          )
          .returning({ id: componentIntelligenceFindings.id }),
      );
    }

    // 3. Feedback, by explicit id and by subject. Must precede the subjects.
    if (feedbackIds.length > 0) {
      report.feedback += await countRemoved(
        db
          .delete(aiSuggestionFeedback)
          .where(inArray(aiSuggestionFeedback.id, feedbackIds))
          .returning({ id: aiSuggestionFeedback.id }),
      );
    }
    if (componentIds.length > 0) {
      report.feedback += await countRemoved(
        db
          .delete(aiSuggestionFeedback)
          .where(inArray(aiSuggestionFeedback.componentId, componentIds))
          .returning({ id: aiSuggestionFeedback.id }),
      );
    }
    if (definitionIds.length > 0) {
      report.feedback += await countRemoved(
        db
          .delete(aiSuggestionFeedback)
          .where(
            inArray(aiSuggestionFeedback.attributeDefinitionId, definitionIds),
          )
          .returning({ id: aiSuggestionFeedback.id }),
      );
    }
    if (categoryIds.length > 0) {
      report.feedback += await countRemoved(
        db
          .delete(aiSuggestionFeedback)
          .where(inArray(aiSuggestionFeedback.categoryId, categoryIds))
          .returning({ id: aiSuggestionFeedback.id }),
      );
    }

    // 4. Activity events, by explicit id and by owned entity id. Deliberately NOT
    //    by orphanhood: an event whose subject was deleted in normal use is
    //    historical, not residue.
    const entityIds = [...new Set([...this.activityEventIds, ...componentIds])];
    if (entityIds.length > 0) {
      report.activityEvents += await countRemoved(
        db
          .delete(activityEvents)
          .where(inArray(activityEvents.entityId, entityIds))
          .returning({ id: activityEvents.id }),
      );
    }

    // 5. Audit rows. Three predicates, because three shapes exist — see the class
    //    doc: actor id, actor email, and the role id inside the details blob.
    const auditConditions = [];
    if (userIds.length > 0) {
      auditConditions.push(inArray(securityAuditLogs.userId, userIds));
    }
    for (const email of emails) {
      auditConditions.push(ilike(securityAuditLogs.userEmail, email));
    }
    if (roleIds.length > 0) {
      auditConditions.push(
        sql`${securityAuditLogs.details}->>'roleId' IN (${sql.join(
          roleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
    if (auditConditions.length > 0) {
      report.auditLogs += await countRemoved(
        db
          .delete(securityAuditLogs)
          .where(or(...auditConditions))
          .returning({ id: securityAuditLogs.id }),
      );
    }

    // 6. Subjects.
    if (componentIds.length > 0) {
      report.components += await countRemoved(
        db
          .delete(components)
          .where(inArray(components.id, componentIds))
          .returning({ id: components.id }),
      );
    }
    if (definitionIds.length > 0) {
      report.attributeDefinitions += await countRemoved(
        db
          .delete(attributeDefinitions)
          .where(inArray(attributeDefinitions.id, definitionIds))
          .returning({ id: attributeDefinitions.id }),
      );
    }
    if (categoryIds.length > 0) {
      report.categories += await countRemoved(
        db
          .delete(categories)
          .where(inArray(categories.id, categoryIds))
          .returning({ id: categories.id }),
      );
    }

    // 7. Identities: users before roles.
    if (userIds.length > 0) {
      report.users += await countRemoved(
        db
          .delete(users)
          .where(inArray(users.id, userIds))
          .returning({ id: users.id }),
      );
    }
    if (roleIds.length > 0) {
      report.roles += await countRemoved(
        db
          .delete(roles)
          .where(inArray(roles.id, roleIds))
          .returning({ id: roles.id }),
      );
    }

    this.cleanedUp = true;
    return report;
  }

  /** Whether {@link cleanup} has run. */
  get isCleanedUp(): boolean {
    return this.cleanedUp;
  }
}

/**
 * Counts the rows a delete removed.
 *
 * Drizzle's `.returning({ id })` is what makes this possible without a second
 * count query, and the count is what turns "cleanup ran" into "cleanup removed N
 * rows" — which is what a leak report needs.
 */
async function countRemoved(statement: PromiseLike<unknown>): Promise<number> {
  const removed = await statement;
  return Array.isArray(removed) ? removed.length : 0;
}

/** What {@link FixtureOwner.cleanup} removed, per table. */
export interface CleanupReport {
  findings: number;
  componentFindings: number;
  feedback: number;
  activityEvents: number;
  auditLogs: number;
  components: number;
  attributeDefinitions: number;
  categories: number;
  users: number;
  roles: number;
}

/** Total rows removed, for a one-line assertion in a suite's `afterAll`. */
export function totalCleaned(report: CleanupReport): number {
  // `Object.values` widens to `any[]` for an interface with no index signature, so
  // the element type is stated rather than inferred.
  const removed = Object.values(report) as number[];
  return removed.reduce((sum, value) => sum + value, 0);
}

/**
 * Snapshot of row counts for the tables integration suites can affect.
 *
 * Used to prove byte-identity: capture before the suite, capture after cleanup,
 * diff. The alternative — trusting that cleanup worked because it did not throw —
 * is how the leaks in Pass 5 survived nine clean runs.
 */
export async function snapshotFixtureTables(): Promise<Record<string, number>> {
  const result = (await db.execute(sql`
    select
      (select count(*) from attribute_definitions) as attribute_definitions,
      (select count(*) from attribute_options) as attribute_options,
      (select count(*) from category_attributes) as category_attributes,
      (select count(*) from component_attribute_values) as component_attribute_values,
      (select count(*) from categories) as categories,
      (select count(*) from ai_suggestion_feedback) as ai_suggestion_feedback,
      (select count(*) from attribute_intelligence_findings) as attribute_intelligence_findings,
      (select count(*) from component_intelligence_findings) as component_intelligence_findings,
      (select count(*) from activity_events) as activity_events,
      (select count(*) from security_audit_logs) as security_audit_logs,
      (select count(*) from components) as components,
      (select count(*) from documents) as documents,
      (select count(*) from users) as users,
      (select count(*) from roles) as roles
  `)) as unknown as Array<Record<string, string>>;

  const row = result[0] ?? {};
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  );
}

/** Tables whose count differs between two snapshots, with both values. */
export function diffSnapshots(
  before: Record<string, number>,
  after: Record<string, number>,
): Array<{ table: string; before: number; after: number; delta: number }> {
  const tables = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...tables]
    .map((table) => ({
      table,
      before: before[table] ?? 0,
      after: after[table] ?? 0,
      delta: (after[table] ?? 0) - (before[table] ?? 0),
    }))
    .filter((entry) => entry.delta !== 0);
}

/**
 * Counts rows a suite still owns after cleanup, for a residue assertion.
 *
 * Deliberately narrow: it reports on the identifiers the owner knows about rather
 * than guessing at what residue might look like.
 */
export async function countOwnedResidue(owner: FixtureOwner): Promise<number> {
  const tag = `%${owner.runTag}%`;
  const result = (await db.execute(sql`
    select count(*) as value from (
      select id from attribute_intelligence_findings where title like ${tag}
      union all
      select id from ai_suggestion_feedback where reviewer_email like ${tag}
      union all
      select id from components where sku like ${tag}
      union all
      select id from users where email like ${tag}
      union all
      select id from roles where name like ${tag}
      union all
      select id from security_audit_logs where user_email like ${tag}
    ) as residue
  `)) as unknown as Array<{ value: string }>;

  return Number(result[0]?.value ?? 0);
}
