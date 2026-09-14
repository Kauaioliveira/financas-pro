import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, toCloudAuthError, toCloudDataError } from './supabaseBackend';

type Result = { data: unknown; error: unknown };

/** Just enough of the supabase-js surface, returning its documented { data, error } shapes. */
function fakeClient(overrides: {
  rpc?: (name: string, args: Record<string, unknown>) => Result | Promise<Result>;
  maybeSingle?: () => Result | Promise<Result>;
  insert?: (row: Record<string, unknown>) => Result | Promise<Result>;
  auth?: Record<string, unknown>;
} = {}) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const query = {
    select: (columns: string) => {
      calls.push({ fn: 'select', args: columns });
      return query;
    },
    order: () => query,
    maybeSingle: async () => overrides.maybeSingle?.() ?? { data: null, error: null },
    then: (resolve: (value: Result) => unknown) => resolve({ data: [], error: null }),
  };
  const client = {
    from: (table: string) => {
      calls.push({ fn: 'from', args: table });
      return {
        ...query,
        insert: async (row: Record<string, unknown>) => {
          calls.push({ fn: 'insert', args: row });
          return overrides.insert?.(row) ?? { data: null, error: null };
        },
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ fn: `rpc:${name}`, args });
      return overrides.rpc?.(name, args) ?? { data: null, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(),
      ...overrides.auth,
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('supabaseBackend data calls', () => {
  it('returns null from save_vault on conflict and the new version otherwise', async () => {
    let conflict = true;
    const { client, calls } = fakeClient({
      rpc: () => (conflict ? { data: null, error: null } : { data: 8, error: null }),
    });
    const backend = createSupabaseBackend(client);

    expect(await backend.saveVault(7, 'cipher', 'device')).toBeNull();
    conflict = false;
    expect(await backend.saveVault(7, 'cipher', 'device')).toBe(8);
    expect(calls.find(c => c.fn === 'rpc:save_vault')?.args).toEqual({
      p_expected_version: 7,
      p_ciphertext: 'cipher',
      p_device_id: 'device',
    });
  });

  it('sends the key rotation and password wrap with their expected versions', async () => {
    const { client, calls } = fakeClient({ rpc: () => ({ data: 3, error: null }) });
    const backend = createSupabaseBackend(client);
    const kdf = { alg: 'PBKDF2-SHA256', iterations: 600_000, salt: 'email-v1', hkdf: 'financaspro/v1' } as const;
    const pwWrap = { iv: 'iv', wrapped: 'w' };
    const kitWrap = { kdf: 'pbkdf2-sha256-local-v1', id: 'abc123', createdAt: 'x', salt: 's', iterations: 600_000, iv: 'i', wrapped: 'k' } as const;

    expect(await backend.rotateVaultKeys(2, kdf, pwWrap, kitWrap, 'c')).toBe(3);
    expect(await backend.setPasswordWrap(4, kdf, pwWrap)).toBe(3);
    expect(calls.find(c => c.fn === 'rpc:rotate_vault_keys')?.args).toEqual({
      p_expected_version: 2, p_kdf: kdf, p_pw_wrap: pwWrap, p_kit_wrap: kitWrap, p_ciphertext: 'c',
    });
    expect(calls.find(c => c.fn === 'rpc:set_password_wrap')?.args).toEqual({
      p_expected_keys_version: 4, p_kdf: kdf, p_pw_wrap: pwWrap,
    });
  });

  it('maps the vault row and asks only for metadata when checking versions', async () => {
    const row = {
      user_id: 'u1', kdf: {}, pw_wrap: { iv: 'a', wrapped: 'b' }, kit_wrap: null,
      keys_version: 2, ciphertext: 'c', version: '5', updated_at: '2026-09-14T00:00:00Z',
    };
    const { client, calls } = fakeClient({ maybeSingle: () => ({ data: row, error: null }) });
    const backend = createSupabaseBackend(client);
    expect(await backend.fetchVault()).toMatchObject({ userId: 'u1', version: 5, keysVersion: 2, kitWrap: null });
    await backend.fetchVaultMeta();
    expect(calls.filter(c => c.fn === 'select').map(c => c.args)).toContain('version,keys_version,updated_at');
  });

  it('turns a unique violation on insert into a conflict and a fetch failure into network', async () => {
    const { client } = fakeClient({
      insert: () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
      rpc: () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }),
    });
    const backend = createSupabaseBackend(client);
    const row = { userId: 'u', kdf: {} as never, pwWrap: { iv: '', wrapped: '' }, kitWrap: {} as never, ciphertext: 'c', deviceId: 'd' };
    await expect(backend.insertVault(row)).rejects.toMatchObject({ kind: 'conflict' });
    await expect(backend.saveVault(1, 'c', 'd')).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('supabaseBackend auth calls', () => {
  it('signs up with the derived secret, the redirect and the display name', async () => {
    const signUp = vi.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: { display_name: 'Ana' } }, session: null }, error: null }));
    const { client } = fakeClient({ auth: { signUp } });
    const result = await createSupabaseBackend(client).signUp({
      email: 'a@b.c', authSecret: 'x'.repeat(43), displayName: 'Ana', redirectTo: 'https://app.test/',
    });
    expect(result).toEqual({ hasSession: false, user: { id: 'u1', email: 'a@b.c', displayName: 'Ana' } });
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'x'.repeat(43),
      options: { emailRedirectTo: 'https://app.test/', data: { display_name: 'Ana' } },
    });
  });

  it('shows the allowlist hook message on sign-up', async () => {
    const signUp = async () => ({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', status: 403, message: 'Cadastro fechado: este e-mail ainda não está na lista do beta.' },
    });
    const { client } = fakeClient({ auth: { signUp } });
    await expect(
      createSupabaseBackend(client).signUp({ email: 'a@b.c', authSecret: 's', displayName: 'A', redirectTo: '' }),
    ).rejects.toThrow(/lista do beta/);
  });

  it('maps auth errors to messages without leaking details', () => {
    expect(toCloudAuthError({ code: 'invalid_credentials', status: 400 }).kind).toBe('invalid-credentials');
    expect(toCloudAuthError({ code: 'email_not_confirmed' }).kind).toBe('email-not-confirmed');
    expect(toCloudAuthError({ code: 'over_request_rate_limit', status: 429 }).kind).toBe('rate-limited');
    expect(toCloudAuthError({ name: 'AuthRetryableFetchError', status: 0 }).kind).toBe('network');
    expect(toCloudAuthError({ status: 500, message: 'internal details' }).message).not.toContain('internal');
    expect(toCloudDataError({ code: '42501' }).kind).toBe('not-authenticated');
  });

  it('forwards PASSWORD_RECOVERY outside the supabase-js callback', async () => {
    vi.useFakeTimers();
    try {
      let callback: (event: string, session: unknown) => void = () => {};
      const unsubscribe = vi.fn();
      const onAuthStateChange = (cb: typeof callback) => {
        callback = cb;
        return { data: { subscription: { unsubscribe } } };
      };
      const { client } = fakeClient({ auth: { onAuthStateChange } });
      const listener = vi.fn();
      const stop = createSupabaseBackend(client).onAuthEvent(listener);

      callback('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } });
      expect(listener).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).toHaveBeenCalledWith({ type: 'password-recovery', user: { id: 'u1', email: 'a@b.c', displayName: '' } });

      stop();
      expect(unsubscribe).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
