import type { BrowserContext, Route } from '@playwright/test';

/**
 * HTTP stand-in for Supabase Auth (GoTrue) and the Data API (PostgREST), enough for
 * the app's cloud flows. It follows supabase/migrations/0001_init.sql for versions
 * and key history. State lives in Node, so several browser contexts share one server
 * (two "devices"). Nothing here talks to a real service.
 */
export const MOCK_SUPABASE_URL = 'http://127.0.0.1:54321';

interface MockUser {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
  displayName: string;
}

export interface MockVault {
  user_id: string;
  kdf: unknown;
  pw_wrap: { iv: string; wrapped: string };
  kit_wrap: { wrapped: string; id?: string } | null;
  keys_version: number;
  ciphertext: string;
  version: number;
  updated_at: string;
  device_id: string | null;
}

interface KeyHistoryEntry {
  id: number;
  user_id: string;
  kdf: unknown;
  pw_wrap: unknown;
  kit_wrap: unknown;
  keys_version: number;
  created_at: string;
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export class MockSupabase {
  users = new Map<string, MockUser>();
  vaults = new Map<string, MockVault>();
  keyHistory: KeyHistoryEntry[] = [];
  vaultHistory: Array<{ id: number; user_id: string; version: number; keys_version: number; ciphertext: string; created_at: string }> = [];
  online = true;
  /** Devices (browser contexts) without internet; the others keep working. */
  offline = new Set<BrowserContext>();
  resetRequests: Array<{ email: string; redirectTo: string | null }> = [];
  unexpected: string[] = [];
  private seq = 1;

  confirm(email: string): void {
    const user = this.users.get(email.toLowerCase());
    if (!user) throw new Error(`mock: no user ${email}`);
    user.confirmed = true;
  }

  private token(user: MockUser): string {
    const now = Math.floor(Date.now() / 1000);
    return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.mock`;
  }

  private userJson(user: MockUser) {
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: user.confirmed ? new Date().toISOString() : null,
      user_metadata: { display_name: user.displayName },
      app_metadata: { provider: 'email' },
      identities: [{ id: user.id, provider: 'email' }],
      created_at: new Date().toISOString(),
    };
  }

  private session(user: MockUser) {
    return {
      access_token: this.token(user),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `refresh-${user.id}`,
      user: this.userJson(user),
    };
  }

  private userFromAuth(route: Route): MockUser | null {
    const header = route.request().headers()['authorization'] ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return [...this.users.values()].find(u => u.id === payload.sub) ?? null;
    } catch {
      return null;
    }
  }

  private recordKeys(row: MockVault): void {
    this.keyHistory.unshift({
      id: this.seq++, user_id: row.user_id, kdf: row.kdf, pw_wrap: row.pw_wrap, kit_wrap: row.kit_wrap,
      keys_version: row.keys_version, created_at: new Date().toISOString(),
    });
    const mine = this.keyHistory.filter(h => h.user_id === row.user_id);
    const keep = new Set(mine.slice(0, 10).map(h => h.id));
    this.keyHistory = this.keyHistory.filter(h => h.user_id !== row.user_id || keep.has(h.id));
  }

  private recordVault(row: MockVault): void {
    const recent = this.vaultHistory.find(h => h.user_id === row.user_id && Date.now() - Date.parse(h.created_at) < 20 * 3600_000);
    if (recent) return;
    this.vaultHistory.unshift({ id: this.seq++, user_id: row.user_id, version: row.version, keys_version: row.keys_version, ciphertext: row.ciphertext, created_at: new Date().toISOString() });
  }

  /** Server-side changes a test makes directly (another device, an attacker). */
  update(userId: string, change: Partial<MockVault>): MockVault {
    const row = this.vaults.get(userId)!;
    const next = { ...row, ...change, updated_at: new Date().toISOString() };
    if (change.kdf || change.pw_wrap || change.kit_wrap) this.recordKeys(row);
    if (change.ciphertext !== undefined && change.ciphertext !== row.ciphertext) this.recordVault(row);
    this.vaults.set(userId, next);
    return next;
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route(`${MOCK_SUPABASE_URL}/**`, route => this.handle(route, context));
  }

  private async handle(route: Route, context: BrowserContext): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    const authError = (status: number, code: string, msg: string) => json(status, { code: status, error_code: code, msg });

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        },
      });
    }
    if (!this.online || this.offline.has(context)) return route.abort('internetdisconnected');

    const body = request.postData() ? JSON.parse(request.postData()!) : {};

    // ---- Auth
    if (path === '/auth/v1/signup' && method === 'POST') {
      const email = String(body.email).toLowerCase();
      const existing = this.users.get(email);
      if (existing) {
        // Confirm email on: an obfuscated user, same shape, no session.
        return json(200, { ...this.userJson(existing), id: crypto.randomUUID(), identities: [] });
      }
      const user: MockUser = {
        id: crypto.randomUUID(), email, password: body.password, confirmed: false,
        displayName: body.data?.display_name ?? '',
      };
      this.users.set(email, user);
      return json(200, this.userJson(user));
    }
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const user = this.users.get(String(body.email).toLowerCase());
      if (!user || user.password !== body.password) return authError(400, 'invalid_credentials', 'Invalid login credentials');
      if (!user.confirmed) return authError(400, 'email_not_confirmed', 'Email not confirmed');
      return json(200, this.session(user));
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/auth/v1/recover' && method === 'POST') {
      this.resetRequests.push({ email: String(body.email).toLowerCase(), redirectTo: url.searchParams.get('redirect_to') });
      return json(200, {});
    }
    if (path === '/auth/v1/user') {
      const user = this.userFromAuth(route);
      if (!user) return authError(401, 'bad_jwt', 'invalid JWT');
      if (method === 'PUT' && body.password) user.password = body.password;
      return json(200, this.userJson(user));
    }

    // ---- Data API
    const user = this.userFromAuth(route);
    if (path.startsWith('/rest/v1/') && !user) return json(401, { code: '42501', message: 'permission denied' });

    if (path === '/rest/v1/vaults' && method === 'GET') {
      const row = this.vaults.get(user!.id);
      return json(200, row ? [row] : []);
    }
    if (path === '/rest/v1/vaults' && method === 'POST') {
      if (body.user_id !== user!.id) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
      if (this.vaults.has(user!.id)) return json(409, { code: '23505', message: 'duplicate key value' });
      this.vaults.set(user!.id, {
        user_id: user!.id, kdf: body.kdf, pw_wrap: body.pw_wrap, kit_wrap: body.kit_wrap, keys_version: 1,
        ciphertext: body.ciphertext, version: 0, updated_at: new Date().toISOString(), device_id: body.device_id ?? null,
      });
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
    }
    if (path === '/rest/v1/vault_key_history' && method === 'GET') {
      return json(200, this.keyHistory.filter(h => h.user_id === user!.id));
    }
    if (path === '/rest/v1/vault_history' && method === 'GET') {
      return json(200, this.vaultHistory.filter(h => h.user_id === user!.id));
    }
    if (path === '/rest/v1/rpc/save_vault') {
      if (!body.p_ciphertext) return json(400, { code: '22023', message: 'invalid_ciphertext' });
      const row = this.vaults.get(user!.id);
      if (!row || row.version !== body.p_expected_version) return json(200, null);
      return json(200, this.update(user!.id, { ciphertext: body.p_ciphertext, version: row.version + 1, device_id: body.p_device_id }).version);
    }
    if (path === '/rest/v1/rpc/set_password_wrap') {
      const row = this.vaults.get(user!.id);
      if (!row || row.keys_version !== body.p_expected_keys_version) return json(200, null);
      return json(200, this.update(user!.id, { kdf: body.p_kdf, pw_wrap: body.p_pw_wrap, keys_version: row.keys_version + 1 }).keys_version);
    }
    if (path === '/rest/v1/rpc/rotate_vault_keys') {
      const row = this.vaults.get(user!.id);
      if (!row || row.version !== body.p_expected_version) return json(200, null);
      return json(200, this.update(user!.id, {
        kdf: body.p_kdf, pw_wrap: body.p_pw_wrap, kit_wrap: body.p_kit_wrap, ciphertext: body.p_ciphertext,
        version: row.version + 1, keys_version: row.keys_version + 1,
      }).version);
    }

    this.unexpected.push(`${method} ${path}${url.search}`);
    return json(404, { message: `mock: unhandled ${method} ${path}` });
  }
}
