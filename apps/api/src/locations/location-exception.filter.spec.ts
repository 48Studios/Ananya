import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { InvalidLocationKindError } from '@ananya/inventory';
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
