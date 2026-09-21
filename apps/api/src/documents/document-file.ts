import * as path from 'path';

/**
 * Upload validation and naming rules for stored documentation files.
 *
 * Everything here is pure so the rules can be unit tested directly, and so the
 * storage provider, the service and the controller all agree on one definition
 * of "acceptable file", "safe name" and "safe storage key".
 */

/**
 * Unchanged from the contract the module already advertised to users (the
 * uploader UI and the previous base64 service both used 50 MB). Pass 1 does not
 * raise or lower it.
 */
export const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Longest stored file name; the DB column is varchar(255). */
export const MAX_DOCUMENT_FILE_NAME_LENGTH = 200;

/**
 * Extension → canonical MIME type.
 *
 * Engineering formats are first-class here: three of the document types
 * (CAD Drawing, 3D Model, Footprint, Symbol) name them explicitly, and browsers
 * frequently report an empty or generic type for them. When the extension is
 * known the mapped type wins, so a `.step` file is not stored as
 * `application/octet-stream`.
 */
export const DOCUMENT_MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  // Documents
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  xml: 'application/xml',
  yml: 'text/yaml',
  yaml: 'text/yaml',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  // Archives
  zip: 'application/zip',
  gz: 'application/gzip',
  // 3D / CAD / EDA
  step: 'model/step',
  stp: 'model/step',
  iges: 'model/iges',
  igs: 'model/iges',
  stl: 'model/stl',
  obj: 'model/obj',
  '3mf': 'model/3mf',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  wrl: 'model/vrml',
  vrml: 'model/vrml',
  f3d: 'application/x-fusion360',
  f3z: 'application/x-fusion360',
  sldprt: 'application/x-solidworks',
  sldasm: 'application/x-solidworks',
  slddrw: 'application/x-solidworks',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  gbr: 'application/x-gerber',
  gerber: 'application/x-gerber',
  kicad_pcb: 'application/x-kicad',
  kicad_sch: 'application/x-kicad',
  sch: 'application/x-eda-schematic',
  brd: 'application/x-eda-board',
  nc: 'application/x-gcode',
  gcode: 'application/x-gcode',
};

/**
 * MIME types accepted when a file's extension carries no information. Mirrors
 * and extends the previous allow-list: the generic binary fallback is retained
 * because it is the type browsers report for several engineering formats, but
 * on its own it is not enough to accept a file (see
 * {@link resolveDocumentMimeType}).
 */
export const ALLOWED_DOCUMENT_MIME_TYPES: string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/yaml',
  'application/json',
  'application/xml',
  'application/zip',
  'application/gzip',
  'application/rtf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/octet-stream',
];

export const ALLOWED_DOCUMENT_EXTENSIONS: string[] = Object.keys(
  DOCUMENT_MIME_TYPE_BY_EXTENSION,
).sort();

/** Generic types that carry no usable format information on their own. */
const OPAQUE_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  '',
]);

export function documentFileExtension(fileName: unknown): string | null {
  if (typeof fileName !== 'string') return null;
  const base = path.basename(fileName.trim());
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  const extension = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9_]{1,16}$/.test(extension) ? extension : null;
}

export interface ResolvedDocumentMimeType {
  ok: true;
  mimeType: string;
}

export interface UnresolvedDocumentMimeType {
  ok: false;
  message: string;
}

export type DocumentMimeTypeResolution =
  ResolvedDocumentMimeType | UnresolvedDocumentMimeType;

/**
 * Decides the MIME type a file will be stored with, or refuses the upload.
 *
 * Order of authority:
 *  1. a known extension (engineering formats included), because browsers send
 *     empty or generic types for most of them;
 *  2. a specific allow-listed type reported by the client;
 *  3. otherwise the file is refused with a message naming the accepted kinds.
 *
 * This is intentionally strict: a bare `application/octet-stream` claiming an
 * unknown extension is not a documented engineering file, it is an unknown
 * payload, and the API rejects it instead of storing it.
 */
export function resolveDocumentMimeType(
  fileName: unknown,
  reportedMimeType?: unknown,
): DocumentMimeTypeResolution {
  const reported =
    typeof reportedMimeType === 'string'
      ? reportedMimeType.split(';')[0]!.trim().toLowerCase()
      : '';

  const extension = documentFileExtension(fileName);
  if (extension && DOCUMENT_MIME_TYPE_BY_EXTENSION[extension]) {
    return { ok: true, mimeType: DOCUMENT_MIME_TYPE_BY_EXTENSION[extension] };
  }

  if (
    !isOpaqueMimeType(reported) &&
    ALLOWED_DOCUMENT_MIME_TYPES.includes(reported)
  ) {
    return { ok: true, mimeType: reported };
  }

  const extensionNote = extension ? ` (.${extension})` : '';
  return {
    ok: false,
    message: `Unsupported file format${extensionNote}. Upload a document, image, archive, spreadsheet, or engineering file such as ${ALLOWED_DOCUMENT_EXTENSIONS.slice(0, 8).join(', ')}.`,
  };
}

export function isOpaqueMimeType(mimeType: unknown): boolean {
  if (typeof mimeType !== 'string') return true;
  return OPAQUE_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

/**
 * Reduces an untrusted file name to a safe, displayable name.
 *
 * Path separators, traversal segments and control characters are removed
 * entirely; anything else outside a conservative character set becomes `_`.
 * The original name is never used to build a filesystem path — see
 * {@link buildDocumentStorageKey}.
 */
export function sanitizeDocumentFileName(fileName: unknown): string {
  const raw = typeof fileName === 'string' ? fileName : '';
  // `path.basename` on a POSIX system does not strip Windows separators.
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  const withoutControlChars = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^a-zA-Z0-9._\- ()]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  const stripped = withoutControlChars.replace(/^\.+/, '');
  const candidate = stripped.length > 0 ? stripped : 'document';

  if (candidate.length <= MAX_DOCUMENT_FILE_NAME_LENGTH) {
    return candidate;
  }

  const extension = documentFileExtension(candidate);
  if (!extension) {
    return candidate.slice(0, MAX_DOCUMENT_FILE_NAME_LENGTH);
  }

  const suffix = `.${extension}`;
  const head = candidate.slice(
    0,
    MAX_DOCUMENT_FILE_NAME_LENGTH - suffix.length,
  );
  return `${head}${suffix}`;
}

/**
 * Builds the storage key for a new object.
 *
 * The key is deliberately flat (no directories) and fully derived from
 * sanitized parts plus a caller-supplied unique id, so two uploads of the same
 * file name can never overwrite each other and a hostile file name cannot
 * influence the path it is written to.
 */
export function buildDocumentStorageKey(parts: {
  entityType: string;
  entityId: string;
  uniqueSuffix: string;
  fileName: string;
}): string {
  const scope = `${sanitizeDocumentStorageSegment(parts.entityType)}_${sanitizeDocumentStorageSegment(parts.entityId)}`;
  const unique = sanitizeDocumentStorageSegment(parts.uniqueSuffix);
  return `${scope}_${unique}_${sanitizeDocumentFileName(parts.fileName)}`;
}

function sanitizeDocumentStorageSegment(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'unknown';
}

/**
 * True when `target` resolves to a location inside `directory`.
 *
 * Storage keys are already sanitized, so this is a second, explicit line of
 * defence: even if a key is crafted by hand it can never address a file outside
 * the configured upload directory.
 */
export function isPathInsideDirectory(
  directory: string,
  target: string,
): boolean {
  const root = path.resolve(directory);
  const resolved = path.resolve(target);
  if (resolved === root) return false;
  return resolved.startsWith(root + path.sep);
}

/** Human-readable size, used in validation errors and API context strings. */
export function formatDocumentBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} bytes`;
}

/**
 * Builds a `Content-Disposition` header value that survives non-ASCII names.
 *
 * Control characters (including CR/LF) are removed first — a file name is
 * attacker-influenced input and must never be able to inject response headers.
 * The plain `filename` parameter keeps legacy clients working, while
 * `filename*` carries the exact UTF-8 name.
 */
export function buildContentDispositionHeader(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const cleaned = fileName
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["\\]/g, '_')
    .trim();
  const safeName = cleaned.length > 0 ? cleaned : 'document';
  const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, '_');
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}
