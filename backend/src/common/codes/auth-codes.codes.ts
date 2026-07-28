/**
 * Authentication Response Codes
 *
 * All authentication-related codes follow the pattern:
 * A + 3 digits (A001, A002, A003, etc.)
 *
 * Format:
 * - A001-A099: Success codes
 * - A100-A199: Validation errors
 * - A200-A299: Authentication errors
 * - A300-A399: Authorization errors
 * - A400-A499: 2FA related codes
 * - A500-A599: Token related codes
 */

export const AUTH_CODES = {
  // ============================================
  // SUCCESS CODES (A001-A099)
  // ============================================
  REGISTRATION_SUCCESS: {
    code: 'A001',
    description: 'User registered successfully',
  },
  LOGIN_SUCCESS: {
    code: 'A002',
    description: 'Login successful',
  },
  LOGOUT_SUCCESS: {
    code: 'A003',
    description: 'Logout successful',
  },
  TOKEN_REFRESHED: {
    code: 'A004',
    description: 'Access token refreshed successfully',
  },
  TWO_FACTOR_ENABLED: {
    code: 'A005',
    description: '2FA enabled successfully',
  },
  TWO_FACTOR_DISABLED: {
    code: 'A006',
    description: '2FA disabled successfully',
  },
  TWO_FACTOR_VERIFIED: {
    code: 'A007',
    description: '2FA verified successfully',
  },
  PASSWORD_RESET_SENT: {
    code: 'A008',
    description: 'Password reset email sent',
  },
  PASSWORD_RESET_SUCCESS: {
    code: 'A009',
    description: 'Password reset successful',
  },
  EMAIL_VERIFIED: {
    code: 'A010',
    description: 'Email verified successfully',
  },

  // ============================================
  // VALIDATION ERRORS (A100-A199)
  // ============================================
  INVALID_PASSWORD_FORMAT: {
    code: 'A100',
    description: 'Password does not meet requirements',
  },
  PASSWORDS_DO_NOT_MATCH: {
    code: 'A101',
    description: 'Password and password confirmation do not match',
  },
  INVALID_EMAIL_FORMAT: {
    code: 'A102',
    description: 'Invalid email format',
  },
  MISSING_REQUIRED_FIELDS: {
    code: 'A103',
    description: 'Required fields are missing',
  },
  INVALID_TOKEN_FORMAT: {
    code: 'A104',
    description: 'Invalid token format',
  },
  INVALID_CODE_FORMAT: {
    code: 'A105',
    description: 'Invalid verification code format',
  },

  // ============================================
  // AUTHENTICATION ERRORS (A200-A299)
  // ============================================
  INVALID_CREDENTIALS: {
    code: 'A200',
    description: 'Invalid email or password',
  },
  ACCOUNT_LOCKED: {
    code: 'A201',
    description: 'Account is temporarily locked due to too many failed login attempts',
  },
  ACCOUNT_NOT_FOUND: {
    code: 'A202',
    description: 'User account not found',
  },
  ACCOUNT_ALREADY_EXISTS: {
    code: 'A203',
    description: 'An account with this email already exists',
  },
  ACCOUNT_INACTIVE: {
    code: 'A204',
    description: 'User account is inactive',
  },
  EMAIL_NOT_VERIFIED: {
    code: 'A205',
    description: 'Email address has not been verified',
  },

  // ============================================
  // AUTHORIZATION ERRORS (A300-A399)
  // ============================================
  UNAUTHORIZED: {
    code: 'A300',
    description: 'Unauthorized access',
  },
  FORBIDDEN: {
    code: 'A301',
    description: 'Access forbidden',
  },
  INSUFFICIENT_PERMISSIONS: {
    code: 'A302',
    description: 'Insufficient permissions to perform this action',
  },

  // ============================================
  // 2FA RELATED CODES (A400-A499)
  // ============================================
  TWO_FACTOR_REQUIRED: {
    code: 'A400',
    description: '2FA verification required to complete login',
  },
  INVALID_TWO_FACTOR_CODE: {
    code: 'A401',
    description: 'Invalid 2FA verification code',
  },
  TWO_FACTOR_ALREADY_ENABLED: {
    code: 'A402',
    description: '2FA is already enabled for this account',
  },
  TWO_FACTOR_NOT_ENABLED: {
    code: 'A403',
    description: '2FA is not enabled for this account',
  },
  TWO_FACTOR_SETUP_NOT_STARTED: {
    code: 'A404',
    description: '2FA setup has not been initiated',
  },
  TWO_FACTOR_SETUP_PENDING: {
    code: 'A405',
    description: '2FA setup is pending verification',
  },
  BACKUP_CODE_USED: {
    code: 'A406',
    description: 'Backup code used successfully',
  },
  INVALID_BACKUP_CODE: {
    code: 'A407',
    description: 'Invalid or already used backup code',
  },
  NO_BACKUP_CODES_REMAINING: {
    code: 'A408',
    description: 'No backup codes remaining',
  },

  // ============================================
  // TOKEN RELATED CODES (A500-A599)
  // ============================================
  INVALID_TOKEN: {
    code: 'A500',
    description: 'Invalid or malformed token',
  },
  TOKEN_EXPIRED: {
    code: 'A501',
    description: 'Token has expired',
  },
  TOKEN_REVOKED: {
    code: 'A502',
    description: 'Token has been revoked',
  },
  REFRESH_TOKEN_INVALID: {
    code: 'A503',
    description: 'Invalid refresh token',
  },
  REFRESH_TOKEN_EXPIRED: {
    code: 'A504',
    description: 'Refresh token has expired',
  },
  TEMP_TOKEN_INVALID: {
    code: 'A505',
    description: 'Invalid temporary token',
  },
  TOKEN_NOT_FOR_TWO_FACTOR: {
    code: 'A506',
    description: 'Token is not valid for 2FA verification',
  },

  // ============================================
  // PASSWORD RESET CODES (A600-A699)
  // ============================================
  PASSWORD_RESET_TOKEN_INVALID: {
    code: 'A600',
    description: 'Invalid password reset token',
  },
  PASSWORD_RESET_TOKEN_EXPIRED: {
    code: 'A601',
    description: 'Password reset token has expired',
  },
  PASSWORD_RESET_TOKEN_USED: {
    code: 'A602',
    description: 'Password reset token has already been used',
  },

  // ============================================
  // EMAIL VERIFICATION CODES (A700-A799)
  // ============================================
  EMAIL_VERIFICATION_TOKEN_INVALID: {
    code: 'A700',
    description: 'Invalid email verification token',
  },
  EMAIL_VERIFICATION_TOKEN_EXPIRED: {
    code: 'A701',
    description: 'Email verification token has expired',
  },
  EMAIL_ALREADY_VERIFIED: {
    code: 'A702',
    description: 'Email has already been verified',
  },
} as const;

/**
 * Type-safe helper to get auth code
 */
export type AuthCodeKey = keyof typeof AUTH_CODES;

/**
 * Helper function to get code and description
 */
export const getAuthCode = (key: AuthCodeKey) => AUTH_CODES[key];

/**
 * Helper to create error response with code
 */
export const createAuthError = (key: AuthCodeKey, additionalData?: Record<string, unknown>) => ({
  code: AUTH_CODES[key].code,
  message: AUTH_CODES[key].description,
  ...additionalData,
});

/**
 * Helper to create success response with code
 */
export const createAuthSuccess = (key: AuthCodeKey, data?: Record<string, unknown>) => ({
  code: AUTH_CODES[key].code,
  message: AUTH_CODES[key].description,
  ...data,
});
