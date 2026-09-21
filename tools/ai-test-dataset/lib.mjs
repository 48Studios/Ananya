/**
 * AI-TEST dataset tooling — shared helpers.
 *
 * Test-data tooling only. Nothing here is imported by the application.
 *
 * Every script talks to the running dev stack over the REAL HTTP API so that
 * guards, DTO validation and domain services are exercised exactly as the UI
 * would exercise them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(HERE, 'manifest.json');
export const TMP_DIR = '/tmp/ai-test-dataset';

/** Marker prefix every seeded record carries. */
export const TEST_PREFIX = 'AI-TEST-';
/** Marker copied verbatim into every generated document body. */
export const DOC_MARKER =
  'AI TEST DOCUMENT - GENERATED FOR ERP INTELLIGENCE TESTING';

export const API_BASE = process.env.ANANYA_API_BASE ?? 'http://localhost:4000';

export function readToken() {
  if (process.env.ANANYA_TOKEN) return process.env.ANANYA_TOKEN;
  if (existsSync('/tmp/ai-test-token.env')) {
    const raw = readFileSync('/tmp/ai-test-token.env', 'utf8');
    const match = raw.match(/aitest-seed-[a-f0-9]+/);
    if (match) return match[0];
  }
  throw new Error(
    'No session token. Set ANANYA_TOKEN or write TOKEN=... to /tmp/ai-test-token.env',
  );
}

let token = null;

function authHeaders(extra = {}) {
  token = token ?? readToken();
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** Thrown for any non-2xx API response so the caller sees status + body. */
export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status} ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function parse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function api(method, path, body, { form } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: form
      ? authHeaders()
      : authHeaders({ 'Content-Type': 'application/json' }),
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const parsed = await parse(res);
  if (!res.ok) throw new ApiError(method, path, res.status, parsed);
  return parsed;
}

export const get = (path) => api('GET', path);
export const post = (path, body) => api('POST', path, body);
export const put = (path, body) => api('PUT', path, body);
export const del = (path) => api('DELETE', path);

/** Multipart upload mirroring the browser upload flow. */
export async function upload(path, fields, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  form.append(
    'file',
    new Blob([file.bytes], { type: file.mimeType }),
    file.name,
  );
  return api('POST', path, undefined, { form });
}

/**
 * Renders a text document to PDF with page breaks.
 *
 * Uses the macOS `cupsfilter` text filter, which converts a form feed (\f)
 * into a real page break. `pypdf` (already a dependency of the ML service)
 * is used to assert the resulting page count so a silently single-page
 * document is caught at generation time rather than during analysis.
 */
export function textToPdf(pages, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, pages.join('\n\f\n'));
  const pdf = execFileSync('cupsfilter', ['-m', 'application/pdf', outPath], {
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const finalPath = outPath.replace(/\.txt$/, '.pdf');
  writeFileSync(finalPath, pdf);
  return { path: finalPath, bytes: pdf };
}

export function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      createdAt: new Date().toISOString(),
      prefix: TEST_PREFIX,
      sessionId: null,
      token: null,
      manufacturers: [],
      categories: [],
      components: [],
      documents: [],
      bindings: [],
      findings: [],
      notes: [],
    };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

export function writeManifest(manifest) {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Tiny async mapper so seeding stays sequential (deterministic ordering). */
export async function sequentially(items, fn) {
  const out = [];
  for (const item of items) out.push(await fn(item));
  return out;
}

export function log(...args) {
  console.log(...args);
}
