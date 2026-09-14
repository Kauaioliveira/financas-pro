import { CloudError } from '../lib/cloud/errors';
import type {
  CloudAuthEvent,
  CloudBackend,
  CloudUser,
  KeyHistoryRow,
  VaultHistoryRow,
  VaultRow,
} from '../lib/cloud/backend';

// Unique across servers: a sync timer left by one test must never match a user of another.
let nextUserId = 1;

interface FakeUser {
  id: string;
  email: string;
  authSecret: string;
  displayName: string;
  confirmed: boolean;
}

/**
 * In-memory stand-in for Supabase that follows the rules of
 * supabase/migrations/0001_init.sql: optimistic versions, keys version, key
 * history (last 10, every change) and vault history. Shared by several
 * "devices" (providers) to simulate the same account on two browsers.
 */
export class FakeCloudServer {
  users = new Map<string, FakeUser>();
  vaults = new Map<string, VaultRow>();
  keyHistory = new Map<string, KeyHistoryRow[]>();
  vaultHistory = new Map<string, VaultHistoryRow[]>();
  online = true;
  autoConfirm = false;
  allowlist: Set<string> | null = null;
  resetRequests: string[] = [];
  calls: string[] = [];
  private clock = Date.parse('2026-09-14T12:00:00.000Z');

  tick(ms = 1_000): string {
    this.clock += ms;
    return new Date(this.clock).toISOString();
  }

  confirm(email: string): void {
    const user = this.users.get(email);
    if (user) user.confirmed = true;
  }

  /** What an attacker with a session can do: overwrite the key wraps with garbage. */
  overwriteKeys(userId: string, garbage: Partial<Pick<VaultRow, 'pwWrap' | 'kitWrap'>>): void {
    const row = this.vaults.get(userId)!;
    this.recordKeys(row);
    this.vaults.set(userId, { ...row, ...garbage, keysVersion: row.keysVersion + 1, updatedAt: this.tick() });
  }

  private recordKeys(row: VaultRow): void {
    const list = this.keyHistory.get(row.userId) ?? [];
    list.unshift({ kdf: row.kdf, pwWrap: row.pwWrap, kitWrap: row.kitWrap, keysVersion: row.keysVersion, createdAt: this.tick() });
    this.keyHistory.set(row.userId, list.slice(0, 10));
  }

  private recordVault(row: VaultRow): void {
    const list = this.vaultHistory.get(row.userId) ?? [];
    list.unshift({ version: row.version, keysVersion: row.keysVersion, ciphertext: row.ciphertext, createdAt: this.tick() });
    this.vaultHistory.set(row.userId, list.slice(0, 7));
  }

  /** A browser: its own login session, same server. */
  device(): FakeDevice {
    return new FakeDevice(this);
  }

  createUser(email: string, authSecret: string, displayName: string): FakeUser {
    const user: FakeUser = {
      id: `00000000-0000-4000-8000-${String(nextUserId++).padStart(12, '0')}`,
      email,
      authSecret,
      displayName,
      confirmed: this.autoConfirm,
    };
    this.users.set(email, user);
    return user;
  }

  updateVault(userId: string, change: (row: VaultRow) => VaultRow): VaultRow {
    const row = this.vaults.get(userId)!;
    const next = change(row);
    if (next.pwWrap !== row.pwWrap || next.kitWrap !== row.kitWrap || next.kdf !== row.kdf) this.recordKeys(row);
    if (next.ciphertext !== row.ciphertext) this.recordVault(row);
    this.vaults.set(userId, next);
    return next;
  }
}

export class FakeDevice implements CloudBackend {
  sessionEmail: string | null = null;
  private listeners = new Set<(event: CloudAuthEvent) => void>();
  private readonly server: FakeCloudServer;

  constructor(server: FakeCloudServer) {
    this.server = server;
  }

  private net(name: string): void {
    this.server.calls.push(name);
    if (!this.server.online) throw new CloudError('network');
  }

  private me(): FakeUser {
    const user = this.sessionEmail ? this.server.users.get(this.sessionEmail) : undefined;
    if (!user) throw new CloudError('not-authenticated');
    return user;
  }

  private toUser(user: FakeUser): CloudUser {
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  /** Simulates opening the password reset link in this browser. */
  openRecoveryLink(email: string): void {
    const user = this.server.users.get(email)!;
    this.sessionEmail = email;
    for (const listener of this.listeners) listener({ type: 'password-recovery', user: this.toUser(user) });
  }

  async getSessionUser() {
    const user = this.sessionEmail ? this.server.users.get(this.sessionEmail) : undefined;
    return user ? this.toUser(user) : null;
  }

  async signUp({ email, authSecret, displayName }: { email: string; authSecret: string; displayName: string }) {
    this.net('signUp');
    if (this.server.allowlist && !this.server.allowlist.has(email)) {
      throw new CloudError('signup-blocked', 'Cadastro fechado: este e-mail ainda não está na lista do beta.');
    }
    const existing = this.server.users.get(email);
    if (existing) return { hasSession: false, user: null };
    const user = this.server.createUser(email, authSecret, displayName);
    if (!user.confirmed) return { hasSession: false, user: this.toUser(user) };
    this.sessionEmail = email;
    return { hasSession: true, user: this.toUser(user) };
  }

  async signIn(email: string, authSecret: string) {
    this.net('signIn');
    const user = this.server.users.get(email);
    if (!user || user.authSecret !== authSecret) throw new CloudError('invalid-credentials');
    if (!user.confirmed) throw new CloudError('email-not-confirmed');
    this.sessionEmail = email;
    return this.toUser(user);
  }

  async signOut() {
    this.sessionEmail = null;
  }

  async updateAuthSecret(authSecret: string) {
    this.net('updateAuthSecret');
    this.me().authSecret = authSecret;
  }

  async requestPasswordReset(email: string) {
    this.net('requestPasswordReset');
    this.server.resetRequests.push(email);
  }

  onAuthEvent(listener: (event: CloudAuthEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async fetchVaultMeta() {
    this.net('fetchVaultMeta');
    const row = this.server.vaults.get(this.me().id);
    return row ? { version: row.version, keysVersion: row.keysVersion, updatedAt: row.updatedAt } : null;
  }

  async fetchVault() {
    this.net('fetchVault');
    const row = this.server.vaults.get(this.me().id);
    return row ? { ...row } : null;
  }

  async insertVault(row: Parameters<CloudBackend['insertVault']>[0]) {
    this.net('insertVault');
    const user = this.me();
    if (row.userId !== user.id) throw new CloudError('not-authenticated');
    if (this.server.vaults.has(user.id)) throw new CloudError('conflict');
    this.server.vaults.set(user.id, {
      userId: user.id,
      kdf: row.kdf,
      pwWrap: row.pwWrap,
      kitWrap: row.kitWrap,
      ciphertext: row.ciphertext,
      version: 0,
      keysVersion: 1,
      updatedAt: this.server.tick(),
    });
  }

  async saveVault(expectedVersion: number, ciphertext: string) {
    this.net('saveVault');
    if (!ciphertext) throw new CloudError('server');
    const row = this.server.vaults.get(this.me().id);
    if (!row || row.version !== expectedVersion) return null;
    return this.server.updateVault(row.userId, r => ({ ...r, ciphertext, version: r.version + 1, updatedAt: this.server.tick() })).version;
  }

  async setPasswordWrap(expectedKeysVersion: number, kdf: VaultRow['kdf'], pwWrap: VaultRow['pwWrap']) {
    this.net('setPasswordWrap');
    const row = this.server.vaults.get(this.me().id);
    if (!row || row.keysVersion !== expectedKeysVersion) return null;
    return this.server.updateVault(row.userId, r => ({ ...r, kdf, pwWrap, keysVersion: r.keysVersion + 1, updatedAt: this.server.tick() })).keysVersion;
  }

  async rotateVaultKeys(
    expectedVersion: number,
    kdf: VaultRow['kdf'],
    pwWrap: VaultRow['pwWrap'],
    kitWrap: NonNullable<VaultRow['kitWrap']>,
    ciphertext: string,
  ) {
    this.net('rotateVaultKeys');
    const row = this.server.vaults.get(this.me().id);
    if (!row || row.version !== expectedVersion) return null;
    return this.server.updateVault(row.userId, r => ({
      ...r,
      kdf,
      pwWrap,
      kitWrap,
      ciphertext,
      version: r.version + 1,
      keysVersion: r.keysVersion + 1,
      updatedAt: this.server.tick(),
    })).version;
  }

  async fetchKeyHistory() {
    this.net('fetchKeyHistory');
    return [...(this.server.keyHistory.get(this.me().id) ?? [])];
  }

  async fetchVaultHistory() {
    this.net('fetchVaultHistory');
    return [...(this.server.vaultHistory.get(this.me().id) ?? [])];
  }
}
