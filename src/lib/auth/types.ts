import type { VaultEnvelope } from '../crypto';
import type { VaultStore } from '../vault';

export interface UserAccount {
  id: string;
  displayName: string;
  email?: string;
  createdAt: string;
  envelope: VaultEnvelope;
}

export interface AuthSession {
  userId: string;
  displayName: string;
  dataKey: CryptoKey;
}

/**
 * A recovery kit generated but not saved yet. Nothing is persisted until
 * commit() runs; dropping the object cancels the renewal.
 */
export interface KitRenewal {
  phrase: string;
  kitId: string;
  kitCreatedAt: string;
  /** Id of the kit that stops working, or null for accounts created before kit ids existed. */
  previousKitId: string | null;
  /** Rotates the data key, re-encrypts the vault and saves atomically. Returns the new data key. */
  commit(): Promise<CryptoKey>;
}

export interface AuthProvider {
  listUsers(): UserAccount[];
  register(displayName: string, password: string): Promise<AuthSession>;
  signIn(userId: string, password: string): Promise<AuthSession>;
  signOut(): void;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void>;
  deleteAccount(userId: string, password: string): Promise<void>;
  getEnvelope(userId: string): VaultEnvelope | null;
  updateEnvelope(userId: string, envelope: VaultEnvelope): void;
  isLockedOut(userId: string): boolean;
  prepareKitRenewal(userId: string, password: string): Promise<KitRenewal>;
}

// --- AuthProviderV2 -------------------------------------------------------
// Async and session-aware, so a cloud provider can implement the same contract.
// The local provider implements it on top of the synchronous AuthProvider above.

export type AuthMode = 'local' | 'cloud';

export interface RegisterInput {
  displayName: string;
  /** Cloud accounts only. */
  email?: string;
  password: string;
}

export interface RegisterResult {
  /** The account exists and its data key is ready, but the session is NOT started. */
  session: AuthSession;
  kit: { phrase: string; kitId: string; kitCreatedAt: string };
}

export interface SignInInput {
  /** Local accounts are picked by id. */
  userId?: string;
  /** Cloud accounts are picked by e-mail. */
  email?: string;
  password: string;
}

// Cloud mode will add results such as "needs-kit" and "needs-vault-setup".
export type SignInResult = { status: 'unlocked'; session: AuthSession };

export interface RecoverWithKitInput {
  userId?: string;
  email?: string;
  phrase: string;
  newPassword: string;
}

export interface AuthProviderV2 {
  readonly mode: AuthMode;
  /** Accounts known on this device (cloud: cached accounts). */
  listLocalAccounts(): Promise<UserAccount[]>;
  register(input: RegisterInput): Promise<RegisterResult>;
  signIn(input: SignInInput): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Requires a session. Returns the refreshed session. */
  changePassword(oldPassword: string, newPassword: string): Promise<AuthSession>;
  /** Sets a new password using the recovery kit. */
  recoverWithKit(input: RecoverWithKitInput): Promise<void>;
  /** Requires a session. Nothing is saved until the returned renewal is committed. */
  prepareKitRenewal(password: string): Promise<KitRenewal>;
  deleteLocalAccount(userId: string, password: string): Promise<void>;
  /** Where the vault of this session is kept. */
  createVaultStore(session: AuthSession): VaultStore;
}
