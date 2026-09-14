import { createContext } from 'react';
import type {
  AuthMode,
  AuthProviderV2,
  AuthSession,
  KeyInfo,
  KitRenewal,
  RegisterResult,
  SyncStatus,
  UserAccount,
} from '../lib/auth';
import type { VaultStore } from '../lib/vault';

export type AuthState =
  | { status: 'locked' }
  | { status: 'unlocked'; session: AuthSession };

export interface AuthContextType {
  state: AuthState;
  mode: AuthMode;
  users: UserAccount[];
  /** False until the account list has been read once; screens wait for it. */
  usersLoaded: boolean;
  provider: AuthProviderV2;
  /** Vault storage for the unlocked session, or null when locked. */
  vaultStore: VaultStore | null;
  /** Cloud sync state, or null for local accounts. */
  syncStatus: SyncStatus | null;
  /** Creates the account and its recovery kit without unlocking the app. */
  register: (displayName: string, password: string) => Promise<RegisterResult>;
  /** Local accounts: sign in by id. */
  signIn: (userId: string, password: string) => Promise<void>;
  /** Opens the app with a session obtained from a provider flow (cloud screens). */
  completeUnlock: (session: AuthSession) => void;
  /** Ends the session. */
  signOut: () => void;
  /** Drops the keys from memory (idle, other tab). */
  lock: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  /** Re-authenticates and generates a kit in memory; nothing is saved until commit(). */
  prepareKitRenewal: (password: string) => Promise<KitRenewal>;
  getDataKey: () => CryptoKey | null;
  getUserId: () => string | null;
  getDisplayName: () => string;
  /** Cloud: the user's choice after a sync conflict. Local: no-op. */
  resolveSyncConflict: (choice: 'use-remote' | 'keep-local') => Promise<void>;
  /** Cloud: check the cloud and send pending edits now. Local: no-op. */
  syncNow: () => void;
  /** Kit and backup information of the session, or null when locked. */
  getKeyInfo: () => KeyInfo | null;
  refreshUsers: () => Promise<void>;
}

export const AuthCtx = createContext<AuthContextType | null>(null);
