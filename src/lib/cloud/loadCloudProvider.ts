import { readCloudConfig } from './env';
import { createCloudAuthProvider } from './cloudAuthProvider';
import type { CloudAuthProvider } from './cloudAuthProvider';
import { createSupabaseBackend } from './supabaseBackend';

export interface LoadedCloud {
  provider: CloudAuthProvider;
  /** Message when the page was opened from an e-mail link that failed (expired, used). */
  linkError: string | null;
}

const AUTH_URL_PARAMS = ['code', 'error', 'error_code', 'error_description', 'type'];

function readLinkError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = search.get('error_code') ?? hash.get('error_code');
  if (!code && !search.get('error') && !hash.get('error')) return null;
  return code === 'otp_expired'
    ? 'O link do e-mail expirou ou já foi usado. Peça outro.'
    : 'Não foi possível usar o link do e-mail. Peça outro.';
}

/** Removes auth parameters from the address bar once the client has read them. */
function cleanAuthParams(): void {
  const url = new URL(window.location.href);
  const hadParams = AUTH_URL_PARAMS.some(name => url.searchParams.has(name)) || /access_token|error/.test(url.hash);
  if (!hadParams) return;
  for (const name of AUTH_URL_PARAMS) url.searchParams.delete(name);
  url.hash = '';
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
}

/**
 * Loads @supabase/supabase-js on demand (cloud builds only) and builds the provider.
 * PKCE: e-mail links carry a one-time code that only the browser which asked for
 * the link can exchange (the verifier stays in this browser's storage).
 */
export async function loadCloudProvider(): Promise<LoadedCloud> {
  const config = readCloudConfig(import.meta.env);
  if (!config) throw new Error('Modo nuvem sem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');

  const linkError = readLinkError();
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.url, config.anonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  const provider = createCloudAuthProvider({
    backend: createSupabaseBackend(client),
    siteUrl: `${window.location.origin}/`,
  });

  // getSession waits for the client to finish reading the URL (code exchange).
  await client.auth.getSession();
  cleanAuthParams();
  return { provider, linkError };
}
