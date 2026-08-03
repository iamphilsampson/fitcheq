// Runtime environment detection based on hostname.
//
// Fail-safe: ONLY the exact production host is treated as production, so any
// other host (staging, local, a preview URL) always shows the env banner. That
// way we can never mistake a non-prod deploy for the real thing.

const PROD_HOST = "fitcheq-production.up.railway.app";

const host = typeof window !== "undefined" ? window.location.hostname : "";

export const isProduction = host === PROD_HOST;

export type AppEnv = "production" | "staging" | "local" | "preview";

export const appEnv: AppEnv = isProduction
  ? "production"
  : host.includes("staging")
    ? "staging"
    : host === "localhost" || host === "127.0.0.1"
      ? "local"
      : "preview";

// Short label shown in the banner (empty for production, which shows no banner).
export const envLabel: string = {
  production: "",
  staging: "STAGING",
  local: "LOCAL DEV",
  preview: "NON-PROD",
}[appEnv];
