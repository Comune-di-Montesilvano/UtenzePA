/**
 * RateLimiter Response Codes
 *
 * All rateLimiter-related codes follow the pattern:
 * R + 3 digits (R001, R002, R003, etc.)
 *
 * Format:
 * - R200-R299: RateLimiter errors
 */

export const RATE_LIMITER_CODES = {
  // ============================================
  // RATE LIMITER ERRORS (R200-R299)
  // ============================================
  TOO_MANY_REQUESTS: {
    code: 'R001',
    description: 'Too many requests',
  },
} as const;

/**
 * Type-safe helper to get rateLimiter code
 */
export type RateLimiterCodeKey = keyof typeof RATE_LIMITER_CODES;

/**
 * Helper function to get code and description
 */
export const getRateLimiterCode = (key: RateLimiterCodeKey) => RATE_LIMITER_CODES[key];

/**
 * Helper to create error response with code
 */
export const createRateLimiterError = (
  key: RateLimiterCodeKey,
  additionalData?: Record<string, unknown>,
) => ({
  code: RATE_LIMITER_CODES[key].code,
  message: RATE_LIMITER_CODES[key].description,
  ...additionalData,
});

/**
 * Helper to create success response with code
 */
export const createRateLimiterSuccess = (
  key: RateLimiterCodeKey,
  data?: Record<string, unknown>,
) => ({
  code: RATE_LIMITER_CODES[key].code,
  message: RATE_LIMITER_CODES[key].description,
  ...data,
});
