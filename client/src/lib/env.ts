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

// Build stamp (baked by Vite `define`; see vite.config.ts). Guarded so the app
// still runs if the defines are ever missing.
export const buildTime: string =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
export const buildCommit: string =
  typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "";

// Compact "6 Aug 14:32" style stamp for the non-prod banner.
export const buildLabel: string = (() => {
  if (!buildTime) return "";
  const d = new Date(buildTime);
  if (isNaN(d.getTime())) return "";
  const stamp = d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return buildCommit ? `${stamp} · ${buildCommit}` : stamp;
})();

// Short label shown in the banner (empty for production, which shows no banner).
export const envLabel: string = {
  production: "",
  staging: "STAGING",
  local: "LOCAL DEV",
  preview: "NON-PROD",
}[appEnv];
