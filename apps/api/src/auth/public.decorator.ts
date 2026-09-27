import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to explicitly mark an endpoint as publicly accessible,
 * bypassing the global authentication guard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
