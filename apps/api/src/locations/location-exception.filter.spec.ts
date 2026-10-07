import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import {
  CannotContainSelfError,
  ContainerHierarchyCycleError,
  ContainerLocationNotFoundError,
  InactiveContainerLocationError,
  InvalidLocationKindError,
  InvalidPhysicalContainmentError,
} from '@ananya/inventory';
import { LocationExceptionFilter } from './location-exception.filter';

/**
 * `InvalidLocationKindError` must surface as a 400, not a 500. Unknown kinds are
 * a client error from the write boundary (domain canonicalization rejects them).
 */
describe('LocationExceptionFilter — InvalidLocationKindError', () => {
  const run = (exception: unknown) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    new LocationExceptionFilter().catch(exception, host);
    return { status, json };
  };

  it('maps an unknown location kind to 400 with the domain message', () => {
    const { status, json } = run(
      new InvalidLocationKindError("Unknown location kind 'pallet'."),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Unknown location kind 'pallet'.",
      }),
    );
  });
});

/**
 * Physical-containment errors (RFC-0069 Phase 2) must map to the HTTP statuses
 * the RFC specifies, independently of the organizational (`parentId`) family.
 */
describe('LocationExceptionFilter — physical containment errors', () => {
  const run = (exception: unknown) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    new LocationExceptionFilter().catch(exception, host);
    return { status, json };
  };

  const cases: Array<[unknown, number]> = [
    [new ContainerLocationNotFoundError('c-1'), HttpStatus.BAD_REQUEST],
    [new InactiveContainerLocationError('c-2'), HttpStatus.CONFLICT],
    [new CannotContainSelfError('l-1'), HttpStatus.BAD_REQUEST],
    [new ContainerHierarchyCycleError('l-1', 'c-1'), HttpStatus.BAD_REQUEST],
    [
      new InvalidPhysicalContainmentError("'cabinet' cannot contain 'bin'."),
      HttpStatus.BAD_REQUEST,
    ],
  ];

  it.each(cases)('maps %p to the expected status', (exception, expected) => {
    const { status, json } = run(exception);
    expect(status).toHaveBeenCalledWith(expected);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expected }),
    );
  });
});
