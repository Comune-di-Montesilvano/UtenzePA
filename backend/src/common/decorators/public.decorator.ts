import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark an endpoint as public (no authentication required)
 * Use this for health checks, public APIs, etc.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
