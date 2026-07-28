export interface JwtPayload {
  sub: string;
  email: string;
  twoFactorAuthenticated: boolean;
  iat?: number;
  exp?: number;
}

export interface TwoFactorPendingPayload {
  sub: string;
  twoFactorPending: true;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  iat?: number;
  exp?: number;
}
