import * as client from "openid-client";
import { Strategy, type VerifyFunction, type AuthenticateOptions } from "openid-client/passport";
import type { Request } from "express";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import "./types"; // Import type augmentation for Express.User

// Injected from routes.ts to claim orphaned records server-side on first sign-in
let claimOrphansFn: ((userId: string) => Promise<void>) | null = null;

export function registerOrphanClaimFn(fn: (userId: string) => Promise<void>) {
  claimOrphansFn = fn;
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL("https://accounts.google.com"),
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 365 * 24 * 60 * 60 * 1000; // 1 year
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: Express.User,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims() as Express.User["claims"];
  user.access_token = tokens.access_token;
  if (tokens.refresh_token) {
    user.refresh_token = tokens.refresh_token;
  }
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: Express.User["claims"]) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"] as string | undefined,
    firstName: claims["given_name"] as string | undefined,
    lastName: claims["family_name"] as string | undefined,
    profileImageUrl: claims["picture"] as string | undefined,
  });
}

// Extend the Strategy to inject Google-specific access_type=offline so that
// a refresh_token is issued, enabling sessions to stay alive for the full
// configured 1-year TTL beyond the ~1h ID token expiry.
class GoogleStrategy extends Strategy {
  authorizationRequestParams<TOptions extends AuthenticateOptions>(
    req: Request,
    options: TOptions
  ): URLSearchParams | Record<string, string> | undefined {
    const base = super.authorizationRequestParams(req, options);
    // Normalise to URLSearchParams so we can safely append access_type
    const params =
      base instanceof URLSearchParams
        ? base
        : new URLSearchParams(base as Record<string, string> | undefined);
    params.set("access_type", "offline");
    return params;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user: Express.User = { claims: tokens.claims() as Express.User["claims"] };
    updateUserSession(user, tokens);
    const claims = tokens.claims() as Express.User["claims"];
    await upsertUser(claims);
    // Server-side orphan claim: automatically run once on first sign-in
    if (claimOrphansFn) {
      try {
        await claimOrphansFn(claims.sub);
      } catch (err) {
        console.error("Orphan claim failed (non-fatal):", err);
      }
    }
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `googleauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new GoogleStrategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`googleauth:${req.hostname}`, {
      prompt: "consent",
      scope: ["openid", "email", "profile"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`googleauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    req.session.save((err) => {
      if (err) console.error("[auth] Session save after token refresh failed:", err);
      next();
    });
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
