import { Component, ComponentSkuAlreadyExistsError } from '@ananya/inventory';
import {
  DrizzleComponentRepository,
  type ComponentDbExecutor,
} from './drizzle-component.repository';

/**
 * drizzle-orm wraps driver failures in `DrizzleQueryError` and keeps the
 * Postgres error on `cause`, which is the shape the repository must understand.
 */
function drizzleWrappedError(code: string): Error {
  const pgError = Object.assign(new Error('duplicate key value violates ...'), {
    code,
  });
  return new Error('Failed query: insert into "components" ...', {
    cause: pgError,
  });
}

function failingExecutor(error: Error): ComponentDbExecutor {
  const terminal = () => ({
    returning: (): Promise<never> => Promise.reject(error),
  });

  return {
    insert: () => ({ values: terminal }),
    update: () => ({ set: () => ({ where: terminal }) }),
  } as unknown as ComponentDbExecutor;
}

function component(): Component {
  return Component.create({
    sku: 'CMP-000003',
    name: '0805 Thick Film Resistor',
    unit: 'pcs',
  });
}

describe('DrizzleComponentRepository error translation', () => {
  it('maps a wrapped unique violation on create to ComponentSkuAlreadyExistsError', async () => {
    const repository = new DrizzleComponentRepository(
      failingExecutor(drizzleWrappedError('23505')),
    );

    await expect(repository.save(component())).rejects.toBeInstanceOf(
      ComponentSkuAlreadyExistsError,
    );
  });

  it('maps a wrapped unique violation on update to ComponentSkuAlreadyExistsError', async () => {
    const repository = new DrizzleComponentRepository(
      failingExecutor(drizzleWrappedError('23505')),
    );

    await expect(repository.update(component())).rejects.toBeInstanceOf(
      ComponentSkuAlreadyExistsError,
    );
  });

  it('propagates failures that are not unique violations', async () => {
    const failure = drizzleWrappedError('23503');
    const repository = new DrizzleComponentRepository(failingExecutor(failure));

    await expect(repository.save(component())).rejects.toBe(failure);
  });
});
