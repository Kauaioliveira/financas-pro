import type { Feedback } from './feedback';

/**
 * What the app needs from the cloud, independent of Supabase. The real adapter is
 * supabaseBackend.ts; tests use an in-memory fake with the same server rules
 * (supabase/migrations/0001_init.sql).
 */

/** How the password wrap key was derived (docs §2). Never contains secrets. */
export interface AccountKdf {
  alg: 'PBKDF2-SHA256';
  iterations: number;
  salt: 'email-v1';
  hkdf: 'financaspro/v1';
}

/** dataKey wrapped by the password wrap key. */
export interface PasswordWrap {
  iv: string;
  wrapped: string;
}

/** dataKey wrapped by the recovery kit. Same shape as the kit wrap of backup files v2. */
export interface KitWrap {
  kdf: 'pbkdf2-sha256-local-v1';
  id: string;
  createdAt: string;
  salt: string;
  iterations: number;
  iv: string;
  wrapped: string;
}

export interface VaultMeta {
  version: number;
  keysVersion: number;
  updatedAt: string;
}

export interface VaultRow extends VaultMeta {
  userId: string;
  kdf: AccountKdf;
  pwWrap: PasswordWrap;
  kitWrap: KitWrap | null;
  /** JSON EncryptedPayload of gzip(JSON of the vault). */
  ciphertext: string;
}

export interface KeyHistoryRow {
  kdf: AccountKdf;
  pwWrap: PasswordWrap;
  kitWrap: KitWrap | null;
  keysVersion: number;
  createdAt: string;
}

export interface VaultHistoryRow {
  version: number;
  keysVersion: number;
  ciphertext: string;
  createdAt: string;
}

export interface CloudUser {
  id: string;
  email: string;
  displayName: string;
}

export type CloudAuthEvent =
  | { type: 'password-recovery'; user: CloudUser }
  | { type: 'signed-out' };

export interface NewVaultRow {
  userId: string;
  kdf: AccountKdf;
  pwWrap: PasswordWrap;
  kitWrap: KitWrap;
  ciphertext: string;
  deviceId: string;
}

export interface CloudBackend {
  /** User of the session persisted in this browser, without network when possible. */
  getSessionUser(): Promise<CloudUser | null>;
  /** hasSession is false while the e-mail is not confirmed. */
  signUp(input: {
    email: string;
    authSecret: string;
    displayName: string;
    redirectTo: string;
  }): Promise<{ hasSession: boolean; user: CloudUser | null }>;
  signIn(email: string, authSecret: string): Promise<CloudUser>;
  signOut(): Promise<void>;
  updateAuthSecret(authSecret: string): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  onAuthEvent(listener: (event: CloudAuthEvent) => void): () => void;

  fetchVaultMeta(): Promise<VaultMeta | null>;
  fetchVault(): Promise<VaultRow | null>;
  /** Throws CloudError kind "conflict" when the row already exists. */
  insertVault(row: NewVaultRow): Promise<void>;
  /** New version, or null on conflict. */
  saveVault(expectedVersion: number, ciphertext: string, deviceId: string): Promise<number | null>;
  /** New keys version, or null on conflict. */
  setPasswordWrap(expectedKeysVersion: number, kdf: AccountKdf, pwWrap: PasswordWrap): Promise<number | null>;
  /** New version, or null on conflict. */
  rotateVaultKeys(
    expectedVersion: number,
    kdf: AccountKdf,
    pwWrap: PasswordWrap,
    kitWrap: KitWrap,
    ciphertext: string,
  ): Promise<number | null>;
  /** Most recent first. */
  fetchKeyHistory(): Promise<KeyHistoryRow[]>;
  /** Most recent first. */
  fetchVaultHistory(): Promise<VaultHistoryRow[]>;
  /** Testers' opinion: insert only, nothing is read back. Never carries vault data. */
  sendFeedback(feedback: Feedback): Promise<void>;
}
