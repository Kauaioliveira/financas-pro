import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CloudError } from './errors';
import type {
  AccountKdf,
  CloudAuthEvent,
  CloudBackend,
  CloudUser,
  KeyHistoryRow,
  KitWrap,
  NewVaultRow,
  PasswordWrap,
  VaultHistoryRow,
  VaultMeta,
  VaultRow,
} from './backend';

// Only types come from supabase-js here: the library itself is loaded with import()
// in loadCloudProvider.ts, so the local bundle never contains it.

interface ErrorLike {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
}

const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

function isNetwork(error: ErrorLike): boolean {
  return (
    error.name === 'AuthRetryableFetchError' ||
    (error.name === 'TypeError' && NETWORK_MESSAGE.test(error.message ?? '')) ||
    NETWORK_MESSAGE.test(error.message ?? '')
  );
}

export function toCloudAuthError(error: ErrorLike, context: 'sign-up' | 'other' = 'other'): CloudError {
  if (isNetwork(error)) return new CloudError('network');
  const code = error.code ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message ?? '')) {
    return new CloudError('invalid-credentials');
  }
  if (code === 'email_not_confirmed') return new CloudError('email-not-confirmed');
  if (code.startsWith('over_') || error.status === 429) return new CloudError('rate-limited');
  if (code === 'weak_password') return new CloudError('weak-password');
  if (
    code === 'signup_disabled' ||
    code === 'email_address_not_authorized' ||
    (context === 'sign-up' && error.status === 403)
  ) {
    // The allowlist hook writes its own message in Portuguese; show it when present.
    const fromHook = /lista do beta/i.test(error.message ?? '') ? error.message : undefined;
    return new CloudError('signup-blocked', fromHook);
  }
  if (error.status === 401 || code === 'session_not_found' || code === 'bad_jwt') {
    return new CloudError('not-authenticated');
  }
  return new CloudError('server');
}

export function toCloudDataError(error: ErrorLike): CloudError {
  if (isNetwork(error)) return new CloudError('network');
  const code = error.code ?? '';
  if (code === '23505') return new CloudError('conflict');
  // 54000: teto de trocas de chave do gatilho snapshot_vault_keys. Nada foi alterado.
  if (code === '54000') return new CloudError('too-many-key-changes');
  if (code === '28000' || code === '42501' || code === 'PGRST301' || code === 'PGRST303') {
    return new CloudError('not-authenticated');
  }
  return new CloudError('server');
}

function toCloudUser(user: User): CloudUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: typeof meta.display_name === 'string' ? meta.display_name : '',
  };
}

interface VaultDbRow {
  user_id: string;
  kdf: AccountKdf;
  pw_wrap: PasswordWrap;
  kit_wrap: KitWrap | null;
  keys_version: number;
  ciphertext: string;
  version: number;
  updated_at: string;
}

async function run<T>(promise: PromiseLike<{ data: T; error: ErrorLike | null }>): Promise<T> {
  let result: { data: T; error: ErrorLike | null };
  try {
    result = await promise;
  } catch (err) {
    throw toCloudDataError(err as ErrorLike);
  }
  if (result.error) throw toCloudDataError(result.error);
  return result.data;
}

export function createSupabaseBackend(client: SupabaseClient): CloudBackend {
  return {
    async getSessionUser() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      return toCloudUser(data.session.user);
    },

    async signUp({ email, authSecret, displayName, redirectTo }) {
      const { data, error } = await client.auth.signUp({
        email,
        password: authSecret,
        options: { emailRedirectTo: redirectTo, data: { display_name: displayName } },
      });
      if (error) throw toCloudAuthError(error, 'sign-up');
      return { hasSession: data.session !== null, user: data.user ? toCloudUser(data.user) : null };
    },

    async signIn(email, authSecret) {
      const { data, error } = await client.auth.signInWithPassword({ email, password: authSecret });
      if (error) throw toCloudAuthError(error);
      return toCloudUser(data.user);
    },

    async signOut() {
      // Local scope: ends the session in this browser even when offline.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && !isNetwork(error)) throw toCloudAuthError(error);
    },

    async updateAuthSecret(authSecret) {
      const { error } = await client.auth.updateUser({ password: authSecret });
      if (error) throw toCloudAuthError(error);
    },

    async requestPasswordReset(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw toCloudAuthError(error);
    },

    onAuthEvent(listener: (event: CloudAuthEvent) => void) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // Never call the client inside this callback (supabase-js can deadlock); defer.
        setTimeout(() => {
          if (event === 'PASSWORD_RECOVERY' && session) {
            listener({ type: 'password-recovery', user: toCloudUser(session.user) });
          } else if (event === 'SIGNED_OUT') {
            listener({ type: 'signed-out' });
          }
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async fetchVaultMeta(): Promise<VaultMeta | null> {
      const row = await run<{ version: number; keys_version: number; updated_at: string } | null>(
        client.from('vaults').select('version,keys_version,updated_at').maybeSingle(),
      );
      return row ? { version: Number(row.version), keysVersion: row.keys_version, updatedAt: row.updated_at } : null;
    },

    async fetchVault(): Promise<VaultRow | null> {
      const row = await run<VaultDbRow | null>(
        client
          .from('vaults')
          .select('user_id,kdf,pw_wrap,kit_wrap,keys_version,ciphertext,version,updated_at')
          .maybeSingle(),
      );
      if (!row) return null;
      return {
        userId: row.user_id,
        kdf: row.kdf,
        pwWrap: row.pw_wrap,
        kitWrap: row.kit_wrap,
        keysVersion: row.keys_version,
        ciphertext: row.ciphertext,
        version: Number(row.version),
        updatedAt: row.updated_at,
      };
    },

    async insertVault(row: NewVaultRow) {
      await run(
        client.from('vaults').insert({
          user_id: row.userId,
          format: 2,
          kdf: row.kdf,
          pw_wrap: row.pwWrap,
          kit_wrap: row.kitWrap,
          ciphertext: row.ciphertext,
          device_id: row.deviceId,
        }),
      );
    },

    async saveVault(expectedVersion, ciphertext, deviceId) {
      const data = await run<number | null>(
        client.rpc('save_vault', {
          p_expected_version: expectedVersion,
          p_ciphertext: ciphertext,
          p_device_id: deviceId,
        }),
      );
      return data === null ? null : Number(data);
    },

    async setPasswordWrap(expectedKeysVersion, kdf, pwWrap) {
      const data = await run<number | null>(
        client.rpc('set_password_wrap', {
          p_expected_keys_version: expectedKeysVersion,
          p_kdf: kdf,
          p_pw_wrap: pwWrap,
        }),
      );
      return data === null ? null : Number(data);
    },

    async rotateVaultKeys(expectedVersion, kdf, pwWrap, kitWrap, ciphertext) {
      const data = await run<number | null>(
        client.rpc('rotate_vault_keys', {
          p_expected_version: expectedVersion,
          p_kdf: kdf,
          p_pw_wrap: pwWrap,
          p_kit_wrap: kitWrap,
          p_ciphertext: ciphertext,
        }),
      );
      return data === null ? null : Number(data);
    },

    async fetchKeyHistory(): Promise<KeyHistoryRow[]> {
      const rows = await run<Array<Pick<VaultDbRow, 'kdf' | 'pw_wrap' | 'kit_wrap' | 'keys_version'> & { created_at: string }> | null>(
        client
          .from('vault_key_history')
          .select('kdf,pw_wrap,kit_wrap,keys_version,created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      );
      return (rows ?? []).map(row => ({
        kdf: row.kdf,
        pwWrap: row.pw_wrap,
        kitWrap: row.kit_wrap,
        keysVersion: row.keys_version,
        createdAt: row.created_at,
      }));
    },

    async fetchVaultHistory(): Promise<VaultHistoryRow[]> {
      const rows = await run<Array<{ version: number; keys_version: number; ciphertext: string; created_at: string }> | null>(
        client
          .from('vault_history')
          .select('version,keys_version,ciphertext,created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      );
      return (rows ?? []).map(row => ({
        version: Number(row.version),
        keysVersion: row.keys_version,
        ciphertext: row.ciphertext,
        createdAt: row.created_at,
      }));
    },
  };
}
