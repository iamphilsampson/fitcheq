/**
 * Typed session user claims stored by Google OAuth passport strategy.
 */
export interface ReplitUserClaims {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  exp?: number;
  [key: string]: unknown;
}

export interface AuthenticatedUser {
  claims: ReplitUserClaims;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

// Extend Express global typings so Request.user is typed without `any` casts
declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}
