import type { VaultEnvelope } from '../crypto';
import type { Feedback } from '../cloud/feedback';
import type { VaultStore } from '../vault';
import type { BackupWraps } from '../../utils/backup';

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

export type SignInResult =
  | { status: 'unlocked'; session: AuthSession }
  /** Cloud: signed in, but the account has no vault yet. */
  | { status: 'needs-vault-setup'; email: string }
  /** Cloud: signed in, but the password does not open the data (it was reset by e-mail). */
  | { status: 'needs-kit'; email: string }
  /** Cloud: the e-mail was not confirmed yet. */
  | { status: 'needs-email-confirmation'; email: string };

/** What the settings screens show about the keys of the session. Never secret. */
export interface KeyInfo {
  kitId: string | null;
  kitCreatedAt: string | null;
  hasKit: boolean;
  /** Wraps written into exported backups, or null when a backup cannot be opened later. */
  backupWraps: BackupWraps | null;
}

/** Cloud sync state shown in the header. Local accounts have none. */
export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict' | 'blocked' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Explanation for the user when the state needs attention. */
  message: string | null;
  lastSyncedAt: string | null;
}

export interface RecoverWithKitInput {
  userId?: string;
  email?: string;
  phrase: string;
  newPassword: string;
}

export interface AuthProviderV2 {
  readonly mode: AuthMode;
  /** Message in Portuguese when a new password is not acceptable in this mode, or null. */
  validatePassword(password: string, context?: { email?: string }): string | null;
  /** Drops the keys from memory. Cloud keeps the login session so the password reopens it. */
  lock(): Promise<void>;
  /** Kit and backup information of the session, read synchronously for rendering. */
  describeKeys(session: AuthSession): KeyInfo | null;
  /**
   * Changes whenever the stored keys of the account change (kit renewal, password change),
   * including from another tab. Null when the account is not stored on this device.
   */
  keysFingerprint(userId: string): string | null;
  /** Cloud only. */
  getSyncStatus?(): SyncStatus;
  /** Cloud only. Returns the unsubscribe function. */
  subscribeSync?(listener: (status: SyncStatus) => void): () => void;
  /** Cloud only: the user's explicit choice after a version conflict. */
  resolveSyncConflict?(choice: 'use-remote' | 'keep-local'): Promise<void>;
  /** Cloud only: check the cloud and send pending edits now. */
  syncNow?(): Promise<void>;
  /** Cloud only: sends the tester's opinion. Never carries vault data. */
  sendFeedback?(feedback: Feedback): Promise<void>;
  /** Accounts known on this device (cloud: cached accounts). */
  listLocalAccounts(): Promise<UserAccount[]>;
  register(input: RegisterInput): Promise<RegisterResult>;
  signIn(input: SignInInput): Promise<SignInResult>;
  /** Ends the session (cloud: also the login session in this browser). */
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
