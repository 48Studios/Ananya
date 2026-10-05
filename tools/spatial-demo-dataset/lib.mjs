/**
 * Spatial Demo dataset tooling — shared helpers.
 *
 * Test and demo data tooling only. Nothing here is imported by the application.
 *
 * Talks to the running dev stack over the REAL HTTP API so that
 * guards, DTO validation, and domain services are exercised exactly as the UI
 * exercises them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(HERE, 'manifest.json');

/** Marker prefix every seeded spatial entity carries. */
export const SPATIAL_PREFIX = 'DEMO-SPATIAL-';
export const COMPONENT_PREFIX = 'DEMO-';

export const API_BASE = process.env.ANANYA_API_BASE ?? 'http://localhost:4000';
export const DB_CONTAINER = process.env.ANANYA_DB_CONTAINER ?? 'ananya-db';

export function readToken() {
  if (process.env.ANANYA_TOKEN) return process.env.ANANYA_TOKEN;

  if (existsSync('/tmp/ai-test-token.env')) {
    const raw = readFileSync('/tmp/ai-test-token.env', 'utf8');
    const match = raw.match(/aitest-seed-[a-f0-9]+/) || raw.match(/[a-f0-9]{32,64}/);
    if (match) return match[0];
  }

  // Fallback: Query active session token from the local postgres database container
  try {
    const out = execFileSync(
      'docker',
      [
        'exec',
        DB_CONTAINER,
        'psql',
        '-U',
        'ananya',
        '-d',
        'ananya',
        '-t',
        '-A',
        '-c',
        "SELECT token FROM user_sessions WHERE expires_at > now() ORDER BY expires_at DESC LIMIT 1;",
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (out) return out;
  } catch {
    // Ignore and proceed to error below
  }

  throw new Error(
    'No valid session token found. Start the dev server and log in or set ANANYA_TOKEN.',
  );
}

let cachedToken = null;

function authHeaders(extra = {}) {
  cachedToken = cachedToken ?? readToken();
  return { Authorization: `Bearer ${cachedToken}`, ...extra };
}

export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status} ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function parseResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await parseResponse(res);
  if (!res.ok) {
    throw new ApiError(method, path, res.status, parsed);
  }
  return parsed;
}

export const get = (path) => api('GET', path);
export const post = (path, body) => api('POST', path, body);
export const patch = (path, body) => api('PATCH', path, body);
export const put = (path, body) => api('PUT', path, body);
export const del = (path) => api('DELETE', path);

export function readManifest() {
  const empty = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    models: [],
    anchors: [],
    locations: [],
    layouts: [],
    nodes: [],
    components: [],
    transactions: [],
  };
  if (!existsSync(MANIFEST_PATH)) {
    return empty;
  }
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    return { ...empty, ...parsed, layouts: parsed.layouts ?? [] };
  } catch {
    return empty;
  }
}

/**
 * Persists the manifest so cleanup and re-runs can identify demo records even
 * after the dataset is adopted by code prefix.
 */
export function writeManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Loads the parametric storage engine from the workspace build.
 *
 * The demo dataset derives every slot-derived model dimension from this engine
 * so the seeded geometry can never drift from the geometry the API and the
 * Inventory Builder generate for the same layout config.
 */
let enginePromise = null;
export function loadEngine() {
  enginePromise =
    enginePromise ??
    import(new URL('../../packages/inventory/dist/index.js', import.meta.url))
      .then((engine) => {
        if (typeof engine.generateStorageCompartments !== 'function') {
          throw new Error(
            'The @ananya/inventory build does not export generateStorageCompartments.',
          );
        }
        return engine;
      })
      .catch((error) => {
        throw new Error(
          `Unable to load the parametric storage engine from packages/inventory/dist. ` +
            `Run 'pnpm --filter @ananya/inventory build' first. (${error.message})`,
        );
      });
  return enginePromise;
}

/**
 * Generates the compartments for a layout spec and fails loudly when the
 * seeded config is not a valid parametric template.
 */
export async function generateCompartmentMap(config) {
  const engine = await loadEngine();
  const validation = engine.validateParametricConfig(config);
  if (!validation.isValid) {
    throw new Error(
      `Invalid parametric config for template ${config.templateType}: ${validation.errors.join('; ')}`,
    );
  }
  const result = engine.generateStorageCompartments(config);
  return {
    engine,
    compartments: result.compartments,
    byCode: new Map(result.compartments.map((c) => [c.code, c])),
    bySlotId: new Map(result.compartments.map((c) => [c.slotId, c])),
  };
}

export function log(...args) {
  console.log(...args);
}
