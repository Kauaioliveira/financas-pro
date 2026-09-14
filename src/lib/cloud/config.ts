export interface CloudEnv {
  VITE_APP_MODE?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

/** Cloud mode needs both public variables and must not be forced off with VITE_APP_MODE=local. */
export function isCloudEnabled(env: CloudEnv): boolean {
  if (env.VITE_APP_MODE?.trim().toLowerCase() === 'local') return false;
  return Boolean(env.VITE_SUPABASE_URL?.trim() && env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim());
}

export const cloudEnabled = isCloudEnabled(import.meta.env);
