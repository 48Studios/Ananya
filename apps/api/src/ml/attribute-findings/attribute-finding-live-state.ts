import { db, type DbExecutor } from '@ananya/database';
import {
  attributeDefinitions,
  categories,
  categoryAttributes,
  componentAttributeValues,
} from '@ananya/database/schema';
import { count, eq, inArray } from '@ananya/database/query';
import {
  toAttributeIdentitySnapshot,
  toCategorySnapshot,
  type AttributeFindingLiveState,
} from './attribute-finding-expected-state';

/**
 * Reads the authoritative ERP state a stored finding's expected state is checked
 * against.
 *
 * Read-only and bounded: a fixed number of `SELECT`s per call, regardless of how
 * many subjects are asked about, so checking one finding costs the same as
 * checking a page of them. Mirrors `current-attribute-value.ts` on the component
 * side, which exists for the same reason — one definition of "what does the
 * attribute look like right now", used by every reader.
 *
 * Nothing here writes. The staleness rules themselves live in
 * `attribute-finding-expected-state.ts` and are pure; this module only supplies
 * the live facts they compare against.
 */

const LOOKUP_CHUNK_SIZE = 200;

export interface ReadAttributeFindingLiveStateInput {
  attributeDefinitionIds?: string[];
  categoryIds?: string[];
  /**
   * Attribute codes an expectation refers to. Their existence is checked by
   * reduced code rather than by id, because a category-first finding names what
   * it wants bound instead of pointing at a row that may not exist yet.
   */
  attributeCodes?: string[];
  /**
   * Whether to read usage counters. They cost two grouped aggregates, so they are
   * only read when a usage-dependent rule will be evaluated (unused attributes,
   * suspicious bindings).
   */
  includeUsage?: boolean;
}

export async function readAttributeFindingLiveState(
  input: ReadAttributeFindingLiveStateInput,
  client: DbExecutor = db,
): Promise<AttributeFindingLiveState> {
  const attributeIds = unique(input.attributeDefinitionIds);
  const categoryIds = unique(input.categoryIds);
  const attributeCodes = unique(
    (input.attributeCodes ?? []).filter((code) => Boolean(code?.trim())),
  );

  // Definitions are read by id AND by code in one pass: the code lookup exists so
  // an expectation's "does a definition for this code exist?" is answered from the
  // same snapshot as everything else.
  //
  // These run SEQUENTIALLY, deliberately. `client` is a transaction executor on the
  // apply path (see `describeFindingStaleness`), and a transaction owns exactly one
  // pg client — issuing the three reads with `Promise.all` meant three concurrent
  // `client.query()` calls on that single connection. node-postgres deprecates that
  // and warns "Calling client.query() when the client is already executing a query",
  // and pg@9 removes the implicit queueing it currently relies on.
  //
  // The cost is one extra round trip on a bounded, three-query read; the apply path
  // was already serialized on the wire, so nothing is slowed down there. In exchange
  // the helper is safe for any executor it is handed, which is what the shared
  // signature promises.
  const definitionRows = await chunkedIn(attributeIds, (chunk) =>
    client
      .select({
        id: attributeDefinitions.id,
        code: attributeDefinitions.code,
        name: attributeDefinitions.name,
        dataType: attributeDefinitions.dataType,
        unitCategory: attributeDefinitions.unitCategory,
        defaultUnit: attributeDefinitions.defaultUnit,
        aliases: attributeDefinitions.aliases,
        groupName: attributeDefinitions.groupName,
        isActive: attributeDefinitions.isActive,
      })
      .from(attributeDefinitions)
      .where(inArray(attributeDefinitions.id, chunk)),
  );
  const categoryRows = await chunkedIn(categoryIds, (chunk) =>
    client
      .select({
        id: categories.id,
        code: categories.code,
        name: categories.name,
        isActive: categories.isActive,
      })
      .from(categories)
      .where(inArray(categories.id, chunk)),
  );
  const bindingRows = await chunkedIn(categoryIds, (chunk) =>
    client
      .select({
        categoryId: categoryAttributes.categoryId,
        attributeDefinitionId: categoryAttributes.attributeDefinitionId,
      })
      .from(categoryAttributes)
      .where(inArray(categoryAttributes.categoryId, chunk)),
  );

  const codeRows =
    attributeCodes.length > 0
      ? await chunkedIn(attributeCodes, (chunk) =>
          client
            .select({
              id: attributeDefinitions.id,
              code: attributeDefinitions.code,
              name: attributeDefinitions.name,
              dataType: attributeDefinitions.dataType,
              unitCategory: attributeDefinitions.unitCategory,
              defaultUnit: attributeDefinitions.defaultUnit,
              aliases: attributeDefinitions.aliases,
              groupName: attributeDefinitions.groupName,
              isActive: attributeDefinitions.isActive,
            })
            .from(attributeDefinitions)
            .where(inArray(attributeDefinitions.code, chunk)),
        )
      : [];

  const attributes = new Map(
    [...definitionRows, ...codeRows].map((row) => [
      row.id,
      toAttributeIdentitySnapshot(row),
    ]),
  );

  const categoriesById = new Map(
    categoryRows.map((row) => [row.id, toCategorySnapshot(row)]),
  );

  const bindingKeys = new Set<string>();
  const bindingKeysByAttributeCode = new Set<string>();
  for (const binding of bindingRows) {
    bindingKeys.add(`${binding.categoryId}::${binding.attributeDefinitionId}`);
    const definition = attributes.get(binding.attributeDefinitionId);
    if (definition) {
      bindingKeysByAttributeCode.add(
        `${binding.categoryId}::${reduceCode(definition.code)}`,
      );
    }
  }

  const existingAttributeKeys = new Set<string>();
  for (const definition of attributes.values()) {
    existingAttributeKeys.add(reduceCode(definition.code));
    existingAttributeKeys.add(reduceCode(definition.name));
  }

  const componentValueCounts = new Map<string, number>();
  const bindingCounts = new Map<string, number>();

  if (input.includeUsage !== false && attributeIds.length > 0) {
    // Sequential for the same reason as the reads above: `client` may be a
    // transaction's single connection.
    const valueRows = await chunkedIn(attributeIds, (chunk) =>
      client
        .select({
          attributeDefinitionId: componentAttributeValues.attributeDefinitionId,
          value: count(),
        })
        .from(componentAttributeValues)
        .where(inArray(componentAttributeValues.attributeDefinitionId, chunk))
        .groupBy(componentAttributeValues.attributeDefinitionId),
    );
    const bindingCountRows = await chunkedIn(attributeIds, (chunk) =>
      client
        .select({
          attributeDefinitionId: categoryAttributes.attributeDefinitionId,
          value: count(),
        })
        .from(categoryAttributes)
        .where(inArray(categoryAttributes.attributeDefinitionId, chunk))
        .groupBy(categoryAttributes.attributeDefinitionId),
    );

    for (const row of valueRows) {
      componentValueCounts.set(row.attributeDefinitionId, Number(row.value));
    }
    for (const row of bindingCountRows) {
      bindingCounts.set(row.attributeDefinitionId, Number(row.value));
    }
  }

  return {
    attributes,
    categories: categoriesById,
    bindingKeys,
    bindingKeysByAttributeCode,
    existingAttributeKeys,
    componentValueCounts,
    bindingCounts,
  };
}

/** Reads one attribute's activation state, for callers that need only that. */
export async function attributeDefinitionExists(
  attributeDefinitionId: string,
  client: DbExecutor = db,
): Promise<boolean> {
  const [row] = await client
    .select({ id: attributeDefinitions.id })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.id, attributeDefinitionId))
    .limit(1);
  return Boolean(row);
}

function reduceCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function unique(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).filter((value) => Boolean(value))));
}

/**
 * Runs an `IN (...)` query in bounded chunks.
 *
 * A whole-library audit collects every definition and category id, so an
 * unchunked lookup would build a parameter list sized by the catalog. Chunking
 * keeps the statement bounded without changing the result.
 */
async function chunkedIn<T>(
  ids: string[],
  run: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const results: T[] = [];
  for (let index = 0; index < ids.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + LOOKUP_CHUNK_SIZE);
    results.push(...(await run(chunk)));
  }
  return results;
}
