import { appEnv, envLabel, isProduction } from "@/lib/env";

/**
 * Slim fixed ribbon that marks any non-production environment (staging, local,
 * preview) so it can never be mistaken for the real app. Renders nothing on
 * production. The `.has-env-banner` class on the app root (see App.tsx) offsets
 * the sticky page headers so this never overlaps them.
 */
export function EnvBanner() {
  if (isProduction) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] h-[var(--env-banner-h)] flex items-center justify-center gap-2 bg-zinc-900 text-white text-[11px] font-semibold tracking-wide uppercase select-none"
      data-testid="env-banner"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span>{envLabel}</span>
      {appEnv === "staging" && (
        <span className="font-normal normal-case tracking-normal text-zinc-400">· test data</span>
      )}
    </div>
  );
}
