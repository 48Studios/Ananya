import { Inject, Injectable } from '@nestjs/common';
import { db, toDbExecutor, type DbExecutor } from '@ananya/database';
import {
  locations,
  spatialLayouts,
  spatialLayoutMappings,
  spatialLayoutRevisions,
  spatialNodes,
} from '@ananya/database/schema';
import { eq, and, asc, inArray, sql, ne } from '@ananya/database/query';
import {
  validateParametricConfig,
  generateStorageCompartments,
  diffParametricCompartments,
  computeSlotAcknowledgmentSignature,
  getPhysicalAncestorChainIds,
  getPhysicalDescendantLocationIds,
  findSpatialMappingIncompatibilities,
  isTemplateRootCompatible,
  isSpatialSpaceKind,
  type SpatialLayoutRepository,
  type LocationRepository,
  type SpatialNodeRepository,
  type SpatialLayoutWithMappings,
  type SpatialLayoutRevisionRecordProps,
  type ParametricStorageConfig,
  type ParametricTemplateType,
  type CompartmentKind,
  type GeneratedCompartment,
  type SpatialLayoutStatus,
  InactiveLayoutParentError,
  SpatialLayoutNotFoundError,
  SpatialLayoutRevisionConflictError,
  SpatialNodeOwnershipConflictError,
  ParentCannotBeSlotError,
  InvalidParametricConfigError,
  ConcurrentHierarchyMutationError,
  InactiveLocationMappingError,
  DuplicateLocationMappingError,
  DuplicateSlotMappingError,
  IncompatibleLocationKindError,
  IncompatibleSlotKindMappingError,
  IncompatibleLayoutRootKindError,
  InvalidSlotIdError,
  PublishedLayoutAlreadyExistsError,
  CannotDeleteNonDraftLayoutError,
  CannotModifyArchivedLayoutError,
  MalformedSupersededGeometryError,
  GEOMETRY_TOLERANCE_MM,
  LocationNotFoundError,
} from '@ananya/inventory';
import {
  isPostgresErrorCode,
  POSTGRES_UNIQUE_VIOLATION,
} from '../common/utils/postgres-error';
import {
  SPATIAL_LAYOUT_REPOSITORY,
  SPATIAL_NODE_REPOSITORY,
} from './spatial.tokens';
import { LOCATION_REPOSITORY } from '../locations/location.tokens';
import type {
  CreateSpatialLayoutDto,
  UpdateSpatialLayoutDto,
  PublishSpatialLayoutDto,
  ArchiveSpatialLayoutDto,
  SpatialLayoutMappingItemDto,
} from './dtos';
import { DrizzleSpatialLayoutRepository } from '../infrastructure/repositories/drizzle-spatial-layout.repository';

export type SpatialLayoutTransactionRunner = <T>(
  operation: (tx: DbExecutor) => Promise<T>,
) => Promise<T>;

@Injectable()
export class SpatialLayoutService {
  private customTransactionRunner?: SpatialLayoutTransactionRunner;

  constructor(
    @Inject(SPATIAL_LAYOUT_REPOSITORY)
    private readonly layoutRepo: SpatialLayoutRepository,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepo: LocationRepository,
    @Inject(SPATIAL_NODE_REPOSITORY)
    private readonly nodeRepo: SpatialNodeRepository,
  ) {}

  /** For unit tests to inject a mock transaction runner */
  setTransactionRunner(runner: SpatialLayoutTransactionRunner): void {
    this.customTransactionRunner = runner;
  }

  private async runInTx<T>(
    operation: (tx: DbExecutor) => Promise<T>,
  ): Promise<T> {
    if (this.customTransactionRunner) {
      return this.customTransactionRunner(operation);
    }
    return db.transaction(async (tx) => {
      const txExecutor = toDbExecutor(tx);
      return operation(txExecutor);
    });
  }

  /**
   * Builds an immutable revision mappings snapshot.
   *
   * Resolves the PHYSICAL location code for each mapped location (never the slot
   * code) so historical revisions stay readable even after locations are renamed
   * or decommissioned. Falls back to the slot code only if a location row is
   * unexpectedly absent (the FK makes this unreachable in practice).
   */
  private async buildMappingsSnapshot(
    tx: DbExecutor,
    mappings: ReadonlyArray<{
      slotId: string;
      slotCode: string;
      locationId: string;
      isStale?: boolean | null;
      staleReason?: string | null;
      acknowledgedChangeSignature?: string | null;
    }>,
  ): Promise<
    Array<{
      slotId: string;
      slotCode: string;
      locationId: string;
      locationCode: string;
      isStale: boolean;
      staleReason?: string;
      acknowledgedChangeSignature?: string;
    }>
  > {
    if (mappings.length === 0) {
      return [];
    }

    const locationIds = [...new Set(mappings.map((m) => m.locationId))];
    const locationRows = await tx
      .select({ id: locations.id, code: locations.code })
      .from(locations)
      .where(inArray(locations.id, locationIds));
    const locationCodeById = new Map(
      locationRows.map((row) => [row.id, row.code]),
    );

    return mappings.map((m) => ({
      slotId: m.slotId,
      slotCode: m.slotCode,
      locationId: m.locationId,
      locationCode: locationCodeById.get(m.locationId) ?? m.slotCode,
      isStale: m.isStale ?? false,
      ...(m.staleReason ? { staleReason: m.staleReason } : {}),
      ...(m.acknowledgedChangeSignature
        ? { acknowledgedChangeSignature: m.acknowledgedChangeSignature }
        : {}),
    }));
  }

  // ==========================================
  // Layout Retrieval Operations
  // ==========================================

  async getLayout(id: string): Promise<SpatialLayoutWithMappings> {
    const layout = await this.layoutRepo.findById(id);
    if (!layout) {
      throw new SpatialLayoutNotFoundError(id);
    }
    return layout;
  }

  async getAllLayouts(): Promise<SpatialLayoutWithMappings[]> {
    return this.layoutRepo.findAll();
  }

  async getLayoutsByParent(
    parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings[]> {
    return this.layoutRepo.findByParentLocationId(parentLocationId);
  }

  async getActiveLayoutByParent(
    parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings | null> {
    return this.layoutRepo.findActiveByParentLocationId(parentLocationId);
  }

  async getRevisions(
    layoutId: string,
  ): Promise<SpatialLayoutRevisionRecordProps[]> {
    await this.getLayout(layoutId);
    return this.layoutRepo.findRevisions(layoutId);
  }

  async getRevisionByNumber(
    layoutId: string,
    revisionNumber: number,
  ): Promise<SpatialLayoutRevisionRecordProps> {
    await this.getLayout(layoutId);
    const revision = await this.layoutRepo.findRevisionByNumber(
      layoutId,
      revisionNumber,
    );
    if (!revision) {
      throw new SpatialLayoutNotFoundError(
        `Revision ${revisionNumber} for layout ${layoutId}`,
      );
    }
    return revision;
  }

  // ==========================================
  // Layout Creation (Defaults to DRAFT)
  // ==========================================

  async createLayout(
    dto: CreateSpatialLayoutDto,
    userId?: string,
  ): Promise<SpatialLayoutWithMappings> {
    // 1. Explicitly force new layouts to DRAFT regardless of input or schema default
    const status: SpatialLayoutStatus = 'DRAFT';

    // 2. Validate configuration through parametric engine
    const config = dto.config as unknown as ParametricStorageConfig;
    const validation = validateParametricConfig(config);
    if (!validation.isValid) {
      throw new InvalidParametricConfigError(validation.errors);
    }

    const generated = generateStorageCompartments(config);
    const slotMap = new Map<string, GeneratedCompartment>();
    for (const c of generated.compartments) {
      slotMap.set(c.slotId, c);
    }

    // 3. Verify mappings if provided
    const mappings = dto.mappings ?? [];
    this.assertMappingBijection(mappings);

    return this.runInTx(async (tx) => {
      // 0. Lock the parent location row FOR SHARE before any hierarchy/activity
      //    validation.
      //
      // Previously this existence check was an unlocked read, so a create racing
      // a concurrent parent deactivation / reparenting / deletion could validate
      // against — or commit alongside — state that was already invalid. Every
      // mutation of a location row takes an exclusive row lock, so a shared lock
      // here serializes the create against all of them while remaining
      // compatible with pure reads and with other draft creates.
      //
      // FOR SHARE — not FOR UPDATE — is deliberate:
      //   * Draft creation has no competing-write invariant on the parent (any
      //     number of drafts may coexist), so publishLayout's FOR UPDATE strength
      //     is not required.
      //   * validateMappingsHierarchyAndActivity() acquires shared locks on
      //     [parent, ...mapped locations] as one statement in id order. A FOR
      //     UPDATE pre-lock could interleave with that statement's mapped-location
      //     lock and form a deadlock cycle; shared locks never conflict with each
      //     other, so no cycle is possible.
      // The lock is held until the transaction commits or rolls back, which is
      // exactly the window in which the hierarchy read and inserts below run.
      const [parentLoc] = await tx
        .select()
        .from(locations)
        .where(eq(locations.id, dto.parentLocationId))
        .for('share');

      if (!parentLoc) {
        throw new LocationNotFoundError(dto.parentLocationId);
      }
      this.assertTemplateRootCompatibility(
        dto.templateType as ParametricTemplateType,
        parentLoc.code,
        parentLoc.kind,
      );

      if (mappings.length > 0) {
        await this.validateMappingsHierarchyAndActivity(
          tx,
          dto.parentLocationId,
          mappings,
          slotMap,
        );
      }

      // Insert layout record
      const [newLayout] = await tx
        .insert(spatialLayouts)
        .values({
          parentLocationId: dto.parentLocationId,
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          templateType: dto.templateType,
          engineVersion: dto.engineVersion ?? '1.0.0',
          config: dto.config,
          revision: 1,
          status,
          totalCompartments: generated.totalCompartments,
          metadata: dto.metadata ?? {},
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        })
        .returning();

      if (!newLayout) {
        throw new Error('Failed to create spatial layout record');
      }

      // Insert mapping rows
      if (mappings.length > 0) {
        const compMap = new Map(
          generated.compartments.map((c) => [c.slotId, c]),
        );
        await tx.insert(spatialLayoutMappings).values(
          mappings.map((m) => {
            const comp = compMap.get(m.slotId);
            return {
              layoutId: newLayout.id,
              slotId: m.slotId,
              slotCode: m.slotCode,
              locationId: m.locationId,
              logicalRow: m.logicalRow ?? comp?.logicalIndex.row ?? 0,
              logicalCol: m.logicalCol ?? comp?.logicalIndex.col ?? 0,
              isStale: m.isStale ?? false,
              staleReason: m.staleReason ?? null,
              acknowledgedChangeSignature:
                m.acknowledgedChangeSignature ?? null,
            };
          }),
        );
      }

      const repo = new DrizzleSpatialLayoutRepository(tx);
      const created = await repo.findById(newLayout.id);
      return created!;
    });
  }

  // ==========================================
  // Layout Updates with Optimistic Concurrency
  // ==========================================

  async updateLayout(
    id: string,
    dto: UpdateSpatialLayoutDto,
    userId?: string,
  ): Promise<SpatialLayoutWithMappings> {
    return this.runInTx(async (tx) => {
      // 1. Lock layout header exclusively FOR UPDATE
      const [layout] = await tx
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, id))
        .for('update');

      if (!layout) {
        throw new SpatialLayoutNotFoundError(id);
      }

      // F-05: Enforce archived state (cannot update an archived layout)
      if (layout.status === 'ARCHIVED') {
        throw new CannotModifyArchivedLayoutError(id, 'update');
      }

      // 2. Atomic expected-revision check
      if (layout.revision !== dto.expectedRevision) {
        throw new SpatialLayoutRevisionConflictError(
          layout.revision,
          dto.expectedRevision,
          layout.updatedBy,
          layout.updatedAt,
        );
      }

      // 3. Resolve configuration and compartments
      const effectiveConfig = (dto.config ??
        layout.config) as unknown as ParametricStorageConfig;
      const effectiveTemplateType = dto.templateType ?? layout.templateType;

      const [parentLoc] = await tx
        .select({
          code: locations.code,
          kind: locations.kind,
        })
        .from(locations)
        .where(eq(locations.id, layout.parentLocationId))
        .for('share');
      if (!parentLoc) {
        throw new LocationNotFoundError(layout.parentLocationId);
      }
      this.assertTemplateRootCompatibility(
        effectiveTemplateType as ParametricTemplateType,
        parentLoc.code,
        parentLoc.kind,
      );

      const validation = validateParametricConfig(effectiveConfig);
      if (!validation.isValid) {
        throw new InvalidParametricConfigError(validation.errors);
      }

      const generated = generateStorageCompartments(effectiveConfig);
      const slotMap = new Map<string, GeneratedCompartment>();
      for (const c of generated.compartments) {
        slotMap.set(c.slotId, c);
      }

      // Previous compartments for diff
      const previousGenerated = generateStorageCompartments(
        layout.config as unknown as ParametricStorageConfig,
      );
      const diff = diffParametricCompartments(
        previousGenerated.compartments,
        generated.compartments,
      );

      // 4. Validate mappings
      const mappings = dto.mappings ?? [];
      this.assertMappingBijection(mappings);

      if (mappings.length > 0) {
        await this.validateMappingsHierarchyAndActivity(
          tx,
          layout.parentLocationId,
          mappings,
          slotMap,
        );
      }

      // Process stale acknowledgment signatures for mappings
      const processedMappings = mappings.map((m) => {
        const comp = slotMap.get(m.slotId);
        if (!comp) return m;

        const meaningChange = diff.meaningChangedSlots.find(
          (s) => s.current.slotId === m.slotId,
        );
        if (meaningChange) {
          const reason =
            m.staleReason ??
            meaningChange.reason ??
            'Physical slot topology or row order changed';
          const expectedSig = computeSlotAcknowledgmentSignature(comp, reason);
          if (
            m.acknowledgedChangeSignature &&
            m.acknowledgedChangeSignature === expectedSig
          ) {
            // Acknowledgment signature matches new topology!
            return {
              ...m,
              isStale: false,
              staleReason: reason,
              acknowledgedChangeSignature: expectedSig,
            };
          } else {
            // Stale review required
            return {
              ...m,
              isStale: true,
              staleReason: reason,
              acknowledgedChangeSignature: null,
            };
          }
        }
        return m;
      });

      // 5. Snapshot previous mappings for revision history
      const prevMappings = await tx
        .select()
        .from(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, id));

      const mappingsSnapshot = await this.buildMappingsSnapshot(
        tx,
        prevMappings,
      );

      // 6. Replace active mappings
      await tx
        .delete(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, id));

      if (processedMappings.length > 0) {
        const compMap = new Map(
          generated.compartments.map((c) => [c.slotId, c]),
        );
        await tx.insert(spatialLayoutMappings).values(
          processedMappings.map((m) => {
            const comp = compMap.get(m.slotId);
            return {
              layoutId: id,
              slotId: m.slotId,
              slotCode: m.slotCode,
              locationId: m.locationId,
              logicalRow: m.logicalRow ?? comp?.logicalIndex.row ?? 0,
              logicalCol: m.logicalCol ?? comp?.logicalIndex.col ?? 0,
              isStale: m.isStale ?? false,
              staleReason: m.staleReason ?? null,
              acknowledgedChangeSignature:
                m.acknowledgedChangeSignature ?? null,
            };
          }),
        );
      }

      // 7. Append immutable revision snapshot
      await tx.insert(spatialLayoutRevisions).values({
        layoutId: id,
        revisionNumber: layout.revision,
        configSnapshot: layout.config,
        mappingsSnapshot,
        diffSummary: diff as unknown as Record<string, unknown>,
        changeDescription: dto.changeDescription ?? null,
        authorId: userId ?? null,
      });

      // 8. Increment revision
      const nextRevision = layout.revision + 1;

      // 9. Reconcile spatial nodes if already PUBLISHED
      if (layout.status === 'PUBLISHED') {
        await this.reconcileSpatialNodesInTx(
          tx,
          layout.id,
          layout.parentLocationId,
          nextRevision,
          generated.compartments,
          processedMappings,
          dto.overwriteManualSpatialNodes ?? false,
          userId,
        );
      }

      await tx
        .update(spatialLayouts)
        .set({
          name: dto.name ?? layout.name,
          description:
            dto.description !== undefined
              ? dto.description
              : layout.description,
          templateType: effectiveTemplateType,
          config: effectiveConfig as unknown as Record<string, unknown>,
          revision: nextRevision,
          totalCompartments: generated.totalCompartments,
          metadata: dto.metadata ?? layout.metadata,
          updatedBy: userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(spatialLayouts.id, id));

      const repo = new DrizzleSpatialLayoutRepository(tx);
      const updated = await repo.findById(id);
      return updated!;
    });
  }

  // ==========================================
  // Explicit Publish Operation
  // ==========================================

  async publishLayout(
    id: string,
    dto: PublishSpatialLayoutDto,
    userId?: string,
  ): Promise<SpatialLayoutWithMappings> {
    return this.runInTx(async (tx) => {
      // 1. Lock layout header FOR UPDATE
      const [layout] = await tx
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, id))
        .for('update');

      if (!layout) {
        throw new SpatialLayoutNotFoundError(id);
      }

      // F-05: Enforce archived state (cannot publish an archived layout)
      if (layout.status === 'ARCHIVED') {
        throw new CannotModifyArchivedLayoutError(id, 'publish');
      }

      // 2. Expected revision check
      if (layout.revision !== dto.expectedRevision) {
        throw new SpatialLayoutRevisionConflictError(
          layout.revision,
          dto.expectedRevision,
          layout.updatedBy,
          layout.updatedAt,
        );
      }

      // 2b. Lock the authoritative parent locations row with FOR UPDATE
      // to serialize concurrent publication attempts for this physical container.
      //
      // The parent's activity flag is read from this same locked row (see 2c):
      // any concurrent deactivation must wait on this lock, and this check
      // observes whatever committed before the lock was granted. Either order
      // is safe — deactivation-then-publish rejects, publish-then-deactivation
      // commits first and the deactivation lands afterwards.
      const [parentLoc] = await tx
        .select({
          id: locations.id,
          code: locations.code,
          kind: locations.kind,
          isActive: locations.isActive,
        })
        .from(locations)
        .where(eq(locations.id, layout.parentLocationId))
        .for('update');

      if (!parentLoc) {
        throw new LocationNotFoundError(layout.parentLocationId);
      }
      this.assertTemplateRootCompatibility(
        layout.templateType as ParametricTemplateType,
        parentLoc.code,
        parentLoc.kind,
      );

      // 2c. Enforce the approved parent-activity policy (Phase 3.4.4): drafts
      // may live under an inactive parent, but publication operationalizes the
      // layout onto the container, so it requires an active parent. Checked
      // here — inside the transaction, against the FOR UPDATE-locked row —
      // never in the shared validation helper, so draft create/update paths
      // are unaffected.
      if (!parentLoc.isActive) {
        throw new InactiveLayoutParentError(layout.parentLocationId);
      }

      // F-02: Check transactionally whether another layout for the same parent is already PUBLISHED
      const [existingPublished] = await tx
        .select({
          id: spatialLayouts.id,
          code: spatialLayouts.code,
        })
        .from(spatialLayouts)
        .where(
          and(
            eq(spatialLayouts.parentLocationId, layout.parentLocationId),
            eq(spatialLayouts.status, 'PUBLISHED'),
            ne(spatialLayouts.id, id),
          ),
        )
        .for('update');

      if (existingPublished) {
        throw new PublishedLayoutAlreadyExistsError(
          layout.parentLocationId,
          existingPublished.id,
          existingPublished.code,
        );
      }

      // 3. Load active mappings
      const mappings = await tx
        .select()
        .from(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, id));

      const config = layout.config as unknown as ParametricStorageConfig;
      const generated = generateStorageCompartments(config);
      const slotMap = new Map<string, GeneratedCompartment>();
      for (const c of generated.compartments) {
        slotMap.set(c.slotId, c);
      }

      // 4. Validate mappings hierarchy and activity in-transaction
      if (mappings.length > 0) {
        await this.validateMappingsHierarchyAndActivity(
          tx,
          layout.parentLocationId,
          mappings,
          slotMap,
        );
      }

      // 5. Reconcile 3D spatial nodes
      const nextRevision = layout.revision + 1;
      const { mutated } = await this.reconcileSpatialNodesInTx(
        tx,
        layout.id,
        layout.parentLocationId,
        nextRevision,
        generated.compartments,
        mappings,
        dto.overwriteManualSpatialNodes ?? false,
        userId,
      );

      // F-06: True idempotent publication
      // If the layout was already PUBLISHED and zero spatial node mutations occurred (no coordinate drift,
      // no nodes created, updated, restored, or pruned), return layout immediately without incrementing revision:
      if (layout.status === 'PUBLISHED' && !mutated) {
        const repo = new DrizzleSpatialLayoutRepository(tx);
        const published = await repo.findById(id);
        return published!;
      }

      // 6. Append immutable revision snapshot
      await tx.insert(spatialLayoutRevisions).values({
        layoutId: id,
        revisionNumber: layout.revision,
        configSnapshot: layout.config,
        mappingsSnapshot: await this.buildMappingsSnapshot(tx, mappings),
        diffSummary: { action: 'PUBLISH' },
        changeDescription: dto.changeDescription ?? 'Published layout',
        authorId: userId ?? null,
      });

      // 7. Update layout status and revision
      try {
        await tx
          .update(spatialLayouts)
          .set({
            status: 'PUBLISHED',
            revision: nextRevision,
            updatedBy: userId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(spatialLayouts.id, id));
      } catch (err) {
        const errCandidate = err as {
          constraint?: string;
          cause?: { constraint?: string };
        };
        const constraint =
          errCandidate?.constraint || errCandidate?.cause?.constraint;
        if (
          isPostgresErrorCode(err, POSTGRES_UNIQUE_VIOLATION) &&
          constraint === 'spatial_layouts_active_parent_unique'
        ) {
          throw new PublishedLayoutAlreadyExistsError(
            layout.parentLocationId,
            'concurrent',
            'concurrently-published',
          );
        }
        throw err;
      }

      const repo = new DrizzleSpatialLayoutRepository(tx);
      const published = await repo.findById(id);
      return published!;
    });
  }

  // ==========================================
  // Explicit Archive Operation
  // ==========================================

  async archiveLayout(
    id: string,
    dto: ArchiveSpatialLayoutDto,
    userId?: string,
  ): Promise<SpatialLayoutWithMappings> {
    return this.runInTx(async (tx) => {
      const [layout] = await tx
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, id))
        .for('update');

      if (!layout) {
        throw new SpatialLayoutNotFoundError(id);
      }

      if (layout.revision !== dto.expectedRevision) {
        throw new SpatialLayoutRevisionConflictError(
          layout.revision,
          dto.expectedRevision,
          layout.updatedBy,
          layout.updatedAt,
        );
      }

      const mappings = await tx
        .select()
        .from(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, id));

      // Append revision snapshot
      await tx.insert(spatialLayoutRevisions).values({
        layoutId: id,
        revisionNumber: layout.revision,
        configSnapshot: layout.config,
        mappingsSnapshot: await this.buildMappingsSnapshot(tx, mappings),
        diffSummary: { action: 'ARCHIVE' },
        changeDescription: dto.changeDescription ?? 'Archived layout',
        authorId: userId ?? null,
      });

      // Cleanup builder-owned spatial nodes when archived
      await this.cleanupBuilderOwnedSpatialNodesInTx(tx, layout.id);

      const nextRevision = layout.revision + 1;
      await tx
        .update(spatialLayouts)
        .set({
          status: 'ARCHIVED',
          revision: nextRevision,
          updatedBy: userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(spatialLayouts.id, id));

      const repo = new DrizzleSpatialLayoutRepository(tx);
      const archived = await repo.findById(id);
      return archived!;
    });
  }

  // ==========================================
  // Delete Layout
  // ==========================================

  async deleteLayout(id: string): Promise<void> {
    await this.runInTx(async (tx) => {
      const [layout] = await tx
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, id))
        .for('update');

      if (!layout) {
        throw new SpatialLayoutNotFoundError(id);
      }

      // F-03: Hard deletion allowed ONLY for DRAFT layouts that were never published
      if (layout.status !== 'DRAFT') {
        throw new CannotDeleteNonDraftLayoutError(id, layout.status);
      }

      // Cleanup builder-owned nodes (if any)
      await this.cleanupBuilderOwnedSpatialNodesInTx(tx, id);

      // Deleting layout cascades to mappings and draft revisions
      await tx.delete(spatialLayouts).where(eq(spatialLayouts.id, id));
    });
  }

  // ==========================================
  // Internal Invariant Validation Helpers
  // ==========================================

  private assertMappingBijection(
    mappings: SpatialLayoutMappingItemDto[],
  ): void {
    const slotSet = new Set<string>();
    const locSet = new Set<string>();

    for (const m of mappings) {
      if (slotSet.has(m.slotId)) {
        throw new DuplicateSlotMappingError(m.slotId);
      }
      slotSet.add(m.slotId);

      if (locSet.has(m.locationId)) {
        throw new DuplicateLocationMappingError(m.locationId);
      }
      locSet.add(m.locationId);
    }
  }

  private async validateMappingsHierarchyAndActivity(
    tx: DbExecutor,
    parentLocationId: string,
    mappings: Array<{ slotId: string; locationId: string }>,
    slotMap: Map<string, GeneratedCompartment>,
  ): Promise<void> {
    // Check all slots exist in parametric geometry
    for (const m of mappings) {
      if (!slotMap.has(m.slotId)) {
        throw new InvalidSlotIdError(m.slotId);
      }
    }

    // Lock parent and mapped locations with FOR SHARE.
    //
    // The IN-list statement below intentionally has no ORDER BY: every lock it
    // takes is FOR SHARE, and shared locks never conflict with each other, so
    // concurrent layout transactions cannot deadlock over visit order here.
    const mappedLocIds = mappings.map((m) => m.locationId);
    const lockIds = [parentLocationId, ...mappedLocIds];

    const lockedLocations = await tx
      .select({
        id: locations.id,
        code: locations.code,
        kind: locations.kind,
        containerId: locations.containerId,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(inArray(locations.id, lockIds))
      .for('share');

    const locMap = new Map(lockedLocations.map((l) => [l.id, l]));

    // 1. Verify parent location
    const parentLoc = locMap.get(parentLocationId);
    if (!parentLoc) {
      throw new LocationNotFoundError(parentLocationId);
    }

    // 2. Lock the full ancestor chain of every mapped location FOR SHARE, in
    //    deterministic id order, then verify membership against the locked
    //    state. Never trust an unlocked snapshot alone.
    //
    // Why the chain matters: the descendant verdict for a mapped location M
    // depends on every row on the path parent -> ... -> M, but the IN-list
    // lock above covers only the two endpoints. Reparenting an intermediate
    // ancestor A (a single-row UPDATE that touches no locked row) would
    // otherwise commit an invalid mapping — or publish 3D nodes for a location
    // outside the container — without any lock wait or error. Every location
    // mutation takes an exclusive row lock, so a shared chain lock serializes
    // this validation strictly before-or-after each link mutation.
    //
    // Why FOR SHARE in id order: shared locks are mutually compatible, so any
    // number of concurrent layout transactions can hold overlapping chain
    // locks without waiting on each other; the single ORDER BY id statement
    // means two transactions locking the same chain always visit rows in the
    // same order. Location writers mutate one row per statement and hold no
    // other layout-relevant lock while waiting, so no wait-cycle is
    // constructible. See RFC-0068 section 5.1 for the full ordering argument.
    //
    // Bounded retry: if the hierarchy moved between the chain derivation and
    // the chain lock, re-derive and re-lock up to MAX_HIERARCHY_VERIFY_ATTEMPTS
    // times, then fail closed. Each attempt re-derives the chain from fresh
    // state, so a concurrently-moving hierarchy converges instead of spinning
    // on a stale chain.
    const membership = await this.lockAndVerifyHierarchy(
      tx,
      parentLocationId,
      mappedLocIds,
    );

    // 3. Verify each mapped location
    for (const m of mappings) {
      // Must not be the parent itself
      if (m.locationId === parentLocationId) {
        throw new ParentCannotBeSlotError(parentLocationId, m.slotId);
      }

      const loc = locMap.get(m.locationId);
      if (!loc) {
        throw new LocationNotFoundError(m.locationId);
      }

      // Must be active
      if (!loc.isActive) {
        throw new InactiveLocationMappingError([loc.code]);
      }

      // Must be a space kind? Spaces (warehouse, room, aisle, …) are walkable
      // volume, never a compartment, so they can never be mapped as a slot.
      if (isSpatialSpaceKind(loc.kind)) {
        throw new IncompatibleLocationKindError(loc.code, loc.kind);
      }

      // Must belong to descendant hierarchy
      if (!membership.has(m.locationId)) {
        throw new ConcurrentHierarchyMutationError([loc.code]);
      }
    }

    // 4. Kind compatibility against the generated slot each mapping targets.
    //    Server-side authority: the builder UI filters candidates with the same
    //    domain rule, but filtering is not an integrity boundary.
    this.assertSlotKindCompatibility(parentLoc.kind, mappings, locMap, slotMap);
  }

  /**
   * Rejects mappings whose location kind cannot occupy its generated slot
   * (e.g. a `rack` mapped into a `drawer` compartment).
   */
  private assertSlotKindCompatibility(
    parentKind: string | null | undefined,
    mappings: ReadonlyArray<{ slotId: string; locationId: string }>,
    locMap: ReadonlyMap<string, { code: string; kind: string }>,
    slotMap: ReadonlyMap<string, GeneratedCompartment>,
  ): void {
    const kindsByLocationId = new Map<string, string>();
    for (const [id, loc] of locMap) {
      kindsByLocationId.set(id, loc.kind);
    }
    const slotKindsBySlotId = new Map<string, CompartmentKind>();
    for (const [slotId, compartment] of slotMap) {
      slotKindsBySlotId.set(slotId, compartment.kind);
    }

    const violations = findSpatialMappingIncompatibilities(mappings, {
      rootKind: parentKind,
      kindsByLocationId,
      slotKindsBySlotId,
    });

    if (violations.length > 0) {
      throw new IncompatibleSlotKindMappingError(
        violations.map((violation) => ({
          slotId: violation.slotId,
          slotCode: slotMap.get(violation.slotId)?.code ?? violation.slotId,
          locationCode:
            locMap.get(violation.locationId)?.code ?? violation.locationId,
          candidateKind: violation.candidateKind,
          slotKind: violation.slotKind ?? 'unknown',
        })),
      );
    }
  }

  private assertTemplateRootCompatibility(
    templateType: ParametricStorageConfig['templateType'],
    locationCode: string,
    locationKind: string,
  ): void {
    if (!isTemplateRootCompatible(templateType, locationKind)) {
      throw new IncompatibleLayoutRootKindError(
        templateType,
        locationCode,
        locationKind,
      );
    }
  }

  /**
   * Maximum read -> lock -> re-verify cycles for hierarchy validation.
   *
   * Each cycle re-derives ancestor chains from freshly-read state, so a hierarchy
   * that keeps moving under contention converges instead of spinning forever.
   * Exhaustion fails closed with ConcurrentHierarchyMutationError.
   */
  private static readonly MAX_HIERARCHY_VERIFY_ATTEMPTS = 3;

  /**
   * Locks the ancestor chain of every mapped location FOR SHARE in id order and
   * verifies descendant membership against the locked state.
   *
   * Returns the verified descendant set. Direct-child mappings have a one-link
   * chain (the mapped row itself), which the caller's IN-list lock already
   * holds — locking it again is a harmless no-op, so there is no fast path and
   * no snapshot fallback: every verdict in this function comes from locked
   * state.
   *
   * Throws ConcurrentHierarchyMutationError when the hierarchy moved during
   * locking (after bounded retries) or when a chain cannot be proven.
   */
  private async lockAndVerifyHierarchy(
    tx: DbExecutor,
    parentLocationId: string,
    mappedLocIds: string[],
  ): Promise<Set<string>> {
    for (
      let attempt = 1;
      attempt <= SpatialLayoutService.MAX_HIERARCHY_VERIFY_ATTEMPTS;
      attempt++
    ) {
      // (a) Snapshot the physical container links.
      const linkRows = await tx
        .select({
          id: locations.id,
          containerId: locations.containerId,
        })
        .from(locations);
      const containerById = new Map(
        linkRows.map((row) => [row.id, row.containerId]),
      );

      // (b) Derive the union of physical ancestor chains from the snapshot.
      const chainIds = new Set<string>();
      for (const mappedId of mappedLocIds) {
        if (mappedId === parentLocationId) {
          continue;
        }
        for (const linkId of getPhysicalAncestorChainIds(
          containerById,
          parentLocationId,
          mappedId,
        )) {
          chainIds.add(linkId);
        }
      }

      // (c) Lock the whole physical chain FOR SHARE in deterministic id order.
      //
      // The chain always contains at least the mapped rows themselves, so this
      // statement is never empty when mappings are present. Re-locking rows the
      // caller's IN-list statement already holds FOR SHARE is a no-op.
      const orderedChainIds = [...chainIds].sort();
      if (orderedChainIds.length > 0) {
        await tx
          .select({ id: locations.id })
          .from(locations)
          .where(inArray(locations.id, orderedChainIds))
          .orderBy(asc(locations.id))
          .for('share');
      }

      // (d) Re-read under lock and re-verify.
      //
      // Both reads below execute while the chain lock is held, so no concurrent
      // location writer can change a chain link between them: any UPDATE/DELETE
      // of a chain row blocks on our FOR SHARE lock until we commit or roll
      // back. If a writer committed between step (a) and step (c), the locked
      // re-read observes the new state and the membership check below fails,
      // which retries from a fresh snapshot.
      const lockedLinkRows = await tx
        .select({
          id: locations.id,
          containerId: locations.containerId,
        })
        .from(locations)
        .where(
          orderedChainIds.length > 0
            ? inArray(locations.id, orderedChainIds)
            : sql`false`,
        );

      const freshLinkRows = await tx
        .select({
          id: locations.id,
          containerId: locations.containerId,
        })
        .from(locations);
      const freshContainerById = new Map(
        freshLinkRows.map((row) => [row.id, row.containerId]),
      );

      // Every chain row must still exist ...
      let stable = lockedLinkRows.length === orderedChainIds.length;
      if (stable) {
        // ... and every mapped location must still reach the parent container through
        // locked state.
        for (const mappedId of mappedLocIds) {
          if (mappedId === parentLocationId) {
            continue;
          }
          const chain = getPhysicalAncestorChainIds(
            freshContainerById,
            parentLocationId,
            mappedId,
          );
          if (
            !this.chainReachesParent(
              freshContainerById,
              parentLocationId,
              chain,
            )
          ) {
            stable = false;
            break;
          }
        }
      }

      if (stable) {
        return getPhysicalDescendantLocationIds(
          freshLinkRows,
          parentLocationId,
        );
      }
      // Otherwise loop: re-derive chains from fresh state and try again.
    }

    throw new ConcurrentHierarchyMutationError(mappedLocIds);
  }

  /**
   * Confirms a physical ancestor chain derived from locked state actually terminates at
   * the layout container/parent: every link must be present, and following containerId
   * pointers from the outermost link must reach the layout container/parent.
   * If containerId is null, current is a physical root and does not reach the parent.
   */
  private chainReachesParent(
    containerById: ReadonlyMap<string, string | null | undefined>,
    parentLocationId: string,
    chain: string[],
  ): boolean {
    if (chain.length === 0) {
      return true;
    }
    // The chain is ordered mapped -> ... -> outermost link. Walk it: every link
    // must be present, and following container pointers from the outermost link
    // must reach the layout parent.
    for (const linkId of chain) {
      if (!containerById.has(linkId)) {
        return false;
      }
    }
    const outermost = chain[chain.length - 1] as string;
    let current: string | null | undefined = containerById.get(outermost);
    const visited = new Set<string>(chain);
    while (current) {
      if (current === parentLocationId) {
        return true;
      }
      if (visited.has(current)) {
        return false;
      }
      visited.add(current);
      const next = containerById.get(current);
      if (next === undefined) {
        return false;
      }
      current = next;
    }
    return false;
  }

  // ==========================================
  // Spatial Node Reconciliation
  // ==========================================

  private async reconcileSpatialNodesInTx(
    tx: DbExecutor,
    layoutId: string,
    parentLocationId: string,
    publishedRevision: number,
    compartments: GeneratedCompartment[],
    mappings: Array<{ slotId: string; locationId: string }>,
    overwriteManualNodes: boolean,
    userId?: string,
  ): Promise<{ mutated: boolean }> {
    let mutated = false;

    // 1. Check if parent location has a spatial node
    const [parentNode] = await tx
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, parentLocationId))
      .limit(1);

    const parentSpatialNodeId = parentNode?.id ?? null;

    // 2. Query builder-owned nodes currently tagged for this layout
    const existingOwnedNodes = await tx
      .select()
      .from(spatialNodes)
      .where(
        sql`metadata->>'source' = 'inventory_builder' AND metadata->>'layoutId' = ${layoutId}`,
      );

    const ownedByLocationId = new Map(
      existingOwnedNodes.map((n) => [n.locationId, n]),
    );

    const compBySlotId = new Map(compartments.map((c) => [c.slotId, c]));
    const desiredLocationIds = new Set<string>();

    // 3. Process each desired mapping
    for (const m of mappings) {
      desiredLocationIds.add(m.locationId);
      const comp = compBySlotId.get(m.slotId);
      if (!comp) continue;

      const posX = String(comp.position.x.toFixed(4));
      const posY = String(comp.position.y.toFixed(4));
      const posZ = String(comp.position.z.toFixed(4));
      const rotX = String(comp.rotation.x.toFixed(4));
      const rotY = String(comp.rotation.y.toFixed(4));
      const rotZ = String(comp.rotation.z.toFixed(4));

      const ownedNode = ownedByLocationId.get(m.locationId);

      if (ownedNode) {
        // Owned by this layout already: check if coordinates, rotation, parent, slotId, scale, and visibility match
        const matchesX =
          Math.abs(Number(ownedNode.positionX) - comp.position.x) <
          GEOMETRY_TOLERANCE_MM;
        const matchesY =
          Math.abs(Number(ownedNode.positionY) - comp.position.y) <
          GEOMETRY_TOLERANCE_MM;
        const matchesZ =
          Math.abs(Number(ownedNode.positionZ) - comp.position.z) <
          GEOMETRY_TOLERANCE_MM;
        const matchesRotX =
          Math.abs(Number(ownedNode.rotationX) - comp.rotation.x) <
          GEOMETRY_TOLERANCE_MM;
        const matchesRotY =
          Math.abs(Number(ownedNode.rotationY) - comp.rotation.y) <
          GEOMETRY_TOLERANCE_MM;
        const matchesRotZ =
          Math.abs(Number(ownedNode.rotationZ) - comp.rotation.z) <
          GEOMETRY_TOLERANCE_MM;

        const ownedMeta = ownedNode.metadata || {};
        const matchesSlotId = ownedMeta.slotId === m.slotId;
        const matchesParent =
          ownedNode.parentSpatialNodeId === parentSpatialNodeId;
        const matchesVisibility = ownedNode.isVisible === true;
        const matchesScale =
          Math.abs(Number(ownedNode.scaleX) - 1) < 0.0001 &&
          Math.abs(Number(ownedNode.scaleY) - 1) < 0.0001 &&
          Math.abs(Number(ownedNode.scaleZ) - 1) < 0.0001;
        const matchesPublishedRevision =
          ownedMeta.publishedRevision === publishedRevision;

        if (
          matchesX &&
          matchesY &&
          matchesZ &&
          matchesRotX &&
          matchesRotY &&
          matchesRotZ &&
          matchesParent &&
          matchesSlotId &&
          matchesVisibility &&
          matchesScale &&
          matchesPublishedRevision
        ) {
          // Idempotent: 0 mutations needed for this node!
          continue;
        }

        // Updated geometry or repaired drift
        mutated = true;
        await tx
          .update(spatialNodes)
          .set({
            parentSpatialNodeId,
            positionX: posX,
            positionY: posY,
            positionZ: posZ,
            rotationX: rotX,
            rotationY: rotY,
            rotationZ: rotZ,
            scaleX: '1.0000',
            scaleY: '1.0000',
            scaleZ: '1.0000',
            isVisible: true,
            metadata: {
              ...(ownedNode.metadata ?? {}),
              source: 'inventory_builder',
              layoutId,
              slotId: m.slotId,
              publishedRevision,
            },
            updatedAt: new Date(),
          })
          .where(eq(spatialNodes.id, ownedNode.id));
      } else {
        // Location not currently owned by this layout: check if ANY spatial node exists for it
        const [anyExistingNode] = await tx
          .select()
          .from(spatialNodes)
          .where(eq(spatialNodes.locationId, m.locationId))
          .limit(1);

        if (anyExistingNode) {
          const existingMeta = anyExistingNode.metadata || {};
          const isOwnedByThisLayout =
            existingMeta.source === 'inventory_builder' &&
            existingMeta.layoutId === layoutId;

          if (!isOwnedByThisLayout) {
            if (!overwriteManualNodes) {
              throw new SpatialNodeOwnershipConflictError([
                {
                  nodeId: anyExistingNode.id,
                  locationId: m.locationId,
                  existingSource: (existingMeta.source as string) || 'manual',
                  existingOwnerId:
                    (existingMeta.layoutId as string) ||
                    (existingMeta.author as string) ||
                    null,
                },
              ]);
            }

            // Overwrite with lossless recovery: archive complete superseded state
            mutated = true;
            const supersededGeometry = {
              parentSpatialNodeId: anyExistingNode.parentSpatialNodeId,
              positionX: anyExistingNode.positionX,
              positionY: anyExistingNode.positionY,
              positionZ: anyExistingNode.positionZ,
              rotationX: anyExistingNode.rotationX,
              rotationY: anyExistingNode.rotationY,
              rotationZ: anyExistingNode.rotationZ,
              scaleX: anyExistingNode.scaleX,
              scaleY: anyExistingNode.scaleY,
              scaleZ: anyExistingNode.scaleZ,
              isVisible: anyExistingNode.isVisible,
              modelId: anyExistingNode.modelId,
              anchorId: anyExistingNode.anchorId,
              metadata: anyExistingNode.metadata,
              overwrittenAt: new Date().toISOString(),
              overwrittenBy: userId ?? null,
            };

            await tx
              .update(spatialNodes)
              .set({
                parentSpatialNodeId,
                positionX: posX,
                positionY: posY,
                positionZ: posZ,
                rotationX: rotX,
                rotationY: rotY,
                rotationZ: rotZ,
                scaleX: '1.0000',
                scaleY: '1.0000',
                scaleZ: '1.0000',
                isVisible: true,
                metadata: {
                  source: 'inventory_builder',
                  layoutId,
                  slotId: m.slotId,
                  publishedRevision,
                  supersededGeometry,
                },
                updatedAt: new Date(),
              })
              .where(eq(spatialNodes.id, anyExistingNode.id));
          } else {
            mutated = true;
            await tx
              .update(spatialNodes)
              .set({
                parentSpatialNodeId,
                positionX: posX,
                positionY: posY,
                positionZ: posZ,
                rotationX: rotX,
                rotationY: rotY,
                rotationZ: rotZ,
                metadata: {
                  ...(existingMeta ?? {}),
                  source: 'inventory_builder',
                  layoutId,
                  slotId: m.slotId,
                  publishedRevision,
                },
                updatedAt: new Date(),
              })
              .where(eq(spatialNodes.id, anyExistingNode.id));
          }
        } else {
          // Brand new spatial node insert
          mutated = true;
          await tx.insert(spatialNodes).values({
            locationId: m.locationId,
            parentSpatialNodeId,
            positionX: posX,
            positionY: posY,
            positionZ: posZ,
            rotationX: rotX,
            rotationY: rotY,
            rotationZ: rotZ,
            scaleX: '1.0000',
            scaleY: '1.0000',
            scaleZ: '1.0000',
            isVisible: true,
            metadata: {
              source: 'inventory_builder',
              layoutId,
              slotId: m.slotId,
              publishedRevision,
            },
          });
        }
      }
    }

    // 4. Prune obsolete nodes previously owned by THIS layout ($E \setminus D$)
    for (const owned of existingOwnedNodes) {
      if (!desiredLocationIds.has(owned.locationId)) {
        mutated = true;
        await this.restoreSupersededGeometryOrPruneInTx(tx, owned);
      }
    }

    return { mutated };
  }

  private async restoreSupersededGeometryOrPruneInTx(
    tx: DbExecutor,
    node: typeof spatialNodes.$inferSelect,
  ): Promise<void> {
    const meta = node.metadata || {};
    const hasSuperseded = 'supersededGeometry' in meta;

    if (!hasSuperseded) {
      // Pure builder-created node: prune
      await tx.delete(spatialNodes).where(eq(spatialNodes.id, node.id));
      return;
    }

    const superseded = meta.supersededGeometry;
    if (
      !superseded ||
      typeof superseded !== 'object' ||
      Array.isArray(superseded)
    ) {
      throw new MalformedSupersededGeometryError(
        node.id,
        node.locationId,
        'supersededGeometry record is missing or not an object',
      );
    }

    const s = superseded as Record<string, unknown>;

    /**
     * Coerces a superseded geometry field to its stored decimal string.
     * Only primitives are stringified; any other shape falls back to the default,
     * so a malformed value can never stringify to '[object Object]'.
     */
    const storedDecimal = (value: unknown, fallback: string): string =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : fallback;

    const posX = Number(s.positionX);
    const posY = Number(s.positionY);
    const posZ = Number(s.positionZ);

    if (
      s.positionX === undefined ||
      s.positionY === undefined ||
      s.positionZ === undefined ||
      !Number.isFinite(posX) ||
      !Number.isFinite(posY) ||
      !Number.isFinite(posZ)
    ) {
      throw new MalformedSupersededGeometryError(
        node.id,
        node.locationId,
        'supersededGeometry has missing or non-finite position coordinates',
      );
    }

    // Restore complete original spatial node state
    await tx
      .update(spatialNodes)
      .set({
        parentSpatialNodeId: (s.parentSpatialNodeId as string) ?? null,
        positionX: storedDecimal(s.positionX, '0.0000'),
        positionY: storedDecimal(s.positionY, '0.0000'),
        positionZ: storedDecimal(s.positionZ, '0.0000'),
        rotationX: storedDecimal(s.rotationX, '0.0000'),
        rotationY: storedDecimal(s.rotationY, '0.0000'),
        rotationZ: storedDecimal(s.rotationZ, '0.0000'),
        scaleX: storedDecimal(s.scaleX, '1.0000'),
        scaleY: storedDecimal(s.scaleY, '1.0000'),
        scaleZ: storedDecimal(s.scaleZ, '1.0000'),
        isVisible: s.isVisible !== undefined ? Boolean(s.isVisible) : true,
        modelId: (s.modelId as string) ?? null,
        anchorId: (s.anchorId as string) ?? null,
        metadata: (s.metadata as Record<string, unknown>) ?? {},
        updatedAt: new Date(),
      })
      .where(eq(spatialNodes.id, node.id));
  }

  private async cleanupBuilderOwnedSpatialNodesInTx(
    tx: DbExecutor,
    layoutId: string,
  ): Promise<void> {
    const ownedNodes = await tx
      .select()
      .from(spatialNodes)
      .where(
        sql`metadata->>'source' = 'inventory_builder' AND metadata->>'layoutId' = ${layoutId}`,
      );

    for (const node of ownedNodes) {
      await this.restoreSupersededGeometryOrPruneInTx(tx, node);
    }
  }
}
