import type { Express, Request, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { timingSafeEqual } from "crypto";
import { authStorage } from "./replit_integrations/auth/storage"; // plain DB read, no OAuth deps
import "./replit_integrations/auth/types"; // reuse Express.User type augmentation

/**
 * Single-password auth for a personal, single-user app.
 *
 * Replaces the Replit/Google OAuth flow (kept dormant under
 * server/replit_integrations/auth for a future "Sign in with Google").
 *
 * How it works:
 *  - POST /api/login  { password }  -> checks APP_PASSWORD, marks the session
 *  - GET  /api/logout               -> destroys the session
 *  - isAuthenticated middleware sets req.user.claims.sub to the owner id so all
 *    existing route code (getUserId) keeps working unchanged.
 */

// The owner of all existing data (Phil's original Google sub). Configurable so a
// fresh deployment can point at a different id without a code change.
const OWNER_ID = process.env.OWNER_USER_ID || "103113185755418009684";

// Escape hatch for non-prod: when AUTH_DISABLED=true, every request is treated
// as the owner (no login gate). Intended ONLY for staging so it can be tested
// without a session. Reversible: unset the var.
//
// Hard guard: the flag is IGNORED on the production Railway environment, so even
// an accidental AUTH_DISABLED=true on prod can never open the login gate.
const IS_PROD_ENV = process.env.RAILWAY_ENVIRONMENT_NAME === "production";
const AUTH_DISABLED = process.env.AUTH_DISABLED === "true" && !IS_PROD_ENV;

declare module "express-session" {
  interface SessionData {
    authed?: boolean;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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
    secret: process.env.SESSION_SECRET || "dev-insecure-secret-change-me",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Only require HTTPS cookies in production; local dev is plain http.
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  if (AUTH_DISABLED) {
    console.warn(
      "[auth] AUTH_DISABLED=true — login gate is OFF; all requests run as the owner. Do NOT use this on production.",
    );
  }

  app.post("/api/login", (req, res) => {
    const expected = process.env.APP_PASSWORD;
    if (!expected) {
      console.error("[auth] APP_PASSWORD is not set");
      return res.status(500).json({ message: "Login is not configured" });
    }
    const supplied = typeof req.body?.password === "string" ? req.body.password : "";
    if (!safeEqual(supplied, expected)) {
      return res.status(401).json({ message: "Incorrect password" });
    }
    req.session.authed = true;
    req.session.save((err) => {
      if (err) {
        console.error("[auth] session save failed:", err);
        return res.status(500).json({ message: "Login failed" });
      }
      res.json({ ok: true });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (AUTH_DISABLED || req.session?.authed) {
    // Populate the same shape the routes expect (req.user.claims.sub).
    req.user = { claims: { sub: OWNER_ID }, expires_at: undefined };
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

// Auth-specific routes (mirrors the old registerAuthRoutes signature).
export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: Request, res) => {
    try {
      const user = await authStorage.getUser(OWNER_ID);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}

// No-op: the old Google flow claimed orphaned records on first sign-in. Not
// needed for a single owner, but kept so routes.ts can call it unchanged.
export function registerOrphanClaimFn(_fn: (userId: string) => Promise<void>) {}

export { OWNER_ID };
