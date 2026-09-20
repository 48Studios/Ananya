import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Transaction-boundary guard (Pass 6B §6).
 *
 * Component consolidation is only all-or-nothing if EVERY write happens through
 * the single transaction executor the service opens. A single stray
 * `db.insert(...)` inside an adapter would commit independently and leave
 * partial state behind after a later failure.
 *
 * This suite scans the real source files rather than trusting review: it fails if
 * an adapter ever reaches for the global client. A source scan is the right tool
 * here because the defect it guards against is invisible to behavioural tests
 * that only exercise the happy path.
 */

const CONSOLIDATION_DIR = join(__dirname, 'component-consolidation');
const ADAPTER_DIR = join(CONSOLIDATION_DIR, 'adapters');

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Strips comments so prose about the rule is not mistaken for a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function adapterFiles(): string[] {
  return readdirSync(ADAPTER_DIR).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'),
  );
}

function moduleFiles(): string[] {
  return readdirSync(CONSOLIDATION_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => join(CONSOLIDATION_DIR, name))
    .concat(adapterFiles().map((name) => join(ADAPTER_DIR, name)));
}

describe('Consolidation transaction boundary', () => {
  it('has no global-client write anywhere in the adapters', () => {
    const files = adapterFiles();
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readSource(join(ADAPTER_DIR, file)));
      // Any direct use of the root client — read or write — would escape the
      // transaction. Adapters receive `context.executor` instead.
      if (
        /\bdb\s*\.\s*(insert|update|delete|execute|select|transaction)\b/.test(
          code,
        )
      ) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('opens exactly one transaction, in the orchestration service', () => {
    const transactionSites: string[] = [];
    for (const file of moduleFiles()) {
      const code = stripComments(readSource(file));
      if (/\bdb\s*\.\s*transaction\s*\(/.test(code)) {
        transactionSites.push(file);
      }
    }

    // Exactly one. Anything else would be a second, independent transaction
    // that could commit on its own.
    expect(transactionSites).toHaveLength(1);
    expect(transactionSites[0]).toContain('component-consolidation.service.ts');
  });

  it('binds every repository it constructs to the transaction executor', () => {
    const service = stripComments(
      readSource(join(CONSOLIDATION_DIR, 'component-consolidation.service.ts')),
    );

    const constructions = service.match(
      /new Drizzle[A-Za-z]+Repository\(([^)]*)\)/g,
    );
    expect(constructions).not.toBeNull();
    expect(constructions!.length).toBeGreaterThanOrEqual(8);

    const unbound = constructions!.filter((line) => !line.includes('executor'));
    expect(unbound).toEqual([]);
  });

  it('gives every adapter a way to reach the executor', () => {
    // An adapter either takes a repository (already executor-bound) or reads
    // `context.executor` directly. One of the two must hold.
    const offenders = adapterFiles().filter((file) => {
      const code = stripComments(readSource(join(ADAPTER_DIR, file)));
      const usesExecutor = code.includes('executor');
      const takesRepository = /constructor\(/.test(code);
      return !usesExecutor && !takesRepository;
    });

    expect(offenders).toEqual([]);
  });

  it('keeps the retirement write inside the transaction', () => {
    // The lifecycle transition is the step that must never commit alone: a
    // retired component whose inventory did not move is exactly the partial
    // state this pass forbids.
    const code = stripComments(
      readSource(join(ADAPTER_DIR, 'retirement-consolidation.adapter.ts')),
    );

    expect(code).not.toMatch(/\bdb\s*\./);
    expect(code).toContain('this.components');
  });
});
