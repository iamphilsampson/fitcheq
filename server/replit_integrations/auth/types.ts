/**
 * Typed session user claims stored by Replit Auth passport strategy.
 */
export interface ReplitUserClaims {
  sub: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
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
