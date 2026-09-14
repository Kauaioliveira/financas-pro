/**
 * Pure helpers over the public build variables. No `import.meta` here: this file
 * is also imported by vite.config.ts (Node) to decide, at build time, whether the
 * cloud code is included in the bundle at all.
 */
export interface CloudEnv {
  /** "true"/"1" forces local mode even when the Supabase variables are set. */
  VITE_FORCE_LOCAL?: string;
  /** Older switch kept for compatibility: "local" forces local mode. */
  VITE_APP_MODE?: string;
  VITE_SUPABASE_URL?: string;
  /** Public key of the project: publishable (sb_publishable_...) or legacy anon key. */
  VITE_SUPABASE_ANON_KEY?: string;
  /** Alias of VITE_SUPABASE_ANON_KEY. */
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface CloudConfig {
  url: string;
  anonKey: string;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'sim']);

function isForcedLocal(env: CloudEnv): boolean {
  return (
    TRUE_VALUES.has(env.VITE_FORCE_LOCAL?.trim().toLowerCase() ?? '') ||
    env.VITE_APP_MODE?.trim().toLowerCase() === 'local'
  );
}

/**
 * True for keys that bypass Row Level Security and must never reach a browser:
 * secret keys (sb_secret_...) and legacy JWT keys whose role is service_role.
 */
export function isSecretSupabaseKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_secret_')) return true;
  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}

/**
 * Cloud settings, or null for local mode (variables missing or local forced).
 * Throws when the variables are present but unsafe or malformed, so a broken
 * deploy fails loudly instead of silently running as a local-only app.
 */
export function readCloudConfig(env: CloudEnv): CloudConfig | null {
  if (isForcedLocal(env)) return null;
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !anonKey) return null;

  if (isSecretSupabaseKey(anonKey)) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY contém uma chave secreta (sb_secret_ ou service_role). Use a Publishable key.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('VITE_SUPABASE_URL não é uma URL válida.');
  }
  const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocalHost && parsed.protocol === 'http:')) {
    throw new Error('VITE_SUPABASE_URL precisa usar https.');
  }
  return { url: parsed.origin, anonKey };
}

/**
 * connect-src of the Content-Security-Policy: only this site, plus the Supabase
 * project origin in cloud builds. No wildcard and no wss: (Realtime is not used).
 */
export function connectSrcFor(config: CloudConfig | null): string {
  return config ? `'self' ${config.url}` : `'self'`;
}

/** Cloud mode needs both public variables and must not be forced local. */
export function isCloudEnabled(env: CloudEnv): boolean {
  try {
    return readCloudConfig(env) !== null;
  } catch {
    return true; // configured but invalid: the build fails and the app reports the error
  }
}
