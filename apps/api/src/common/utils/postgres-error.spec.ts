import {
  getPostgresErrorCode,
  isPostgresErrorCode,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from './postgres-error';

/**
 * Mirrors the real shape produced by drizzle-orm 0.44 (`DrizzleQueryError`):
 * the message carries the SQL, the Postgres error rides on `cause`.
 */
function drizzleWrappedError(code: string): Error {
  const pgError = Object.assign(new Error('duplicate key value violates ...'), {
    code,
    severity: 'ERROR',
  });
  return new Error('Failed query: insert into "components" ...', {
    cause: pgError,
  });
}

describe('getPostgresErrorCode', () => {
  it('reads the code from a plain Postgres error', () => {
    expect(getPostgresErrorCode({ code: POSTGRES_UNIQUE_VIOLATION })).toBe(
      POSTGRES_UNIQUE_VIOLATION,
    );
  });

  it('reads the code through a drizzle query error wrapper', () => {
    expect(
      getPostgresErrorCode(drizzleWrappedError(POSTGRES_UNIQUE_VIOLATION)),
    ).toBe(POSTGRES_UNIQUE_VIOLATION);
  });

  it('reads the code when the chain is nested deeper', () => {
    const inner = drizzleWrappedError(POSTGRES_FOREIGN_KEY_VIOLATION);
    const outer = new Error('transaction failed', { cause: inner });

    expect(getPostgresErrorCode(outer)).toBe(POSTGRES_FOREIGN_KEY_VIOLATION);
  });

  it('ignores non-string codes and unrelated errors', () => {
    expect(getPostgresErrorCode(new Error('boom'))).toBeUndefined();
    expect(getPostgresErrorCode({ code: 23505 })).toBeUndefined();
    expect(getPostgresErrorCode(undefined)).toBeUndefined();
    expect(getPostgresErrorCode(null)).toBeUndefined();
    expect(getPostgresErrorCode('23505')).toBeUndefined();
  });

  it('does not loop forever on a self-referencing cause', () => {
    const error = new Error('looping');
    (error as { cause?: unknown }).cause = error;

    expect(getPostgresErrorCode(error)).toBeUndefined();
  });
});

describe('isPostgresErrorCode', () => {
  it('matches only the requested SQLSTATE', () => {
    const error = drizzleWrappedError(POSTGRES_UNIQUE_VIOLATION);

    expect(isPostgresErrorCode(error, POSTGRES_UNIQUE_VIOLATION)).toBe(true);
    expect(isPostgresErrorCode(error, POSTGRES_FOREIGN_KEY_VIOLATION)).toBe(
      false,
    );
  });
});
