import { createContext } from 'react';
import type {
  AuthMode,
  AuthProviderV2,
  AuthSession,
  KitRenewal,
  RegisterResult,
  UserAccount,
} from '../lib/auth';
import type { VaultEnvelope } from '../lib/crypto';
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
  /** Creates the account and its recovery kit without unlocking the app. */
  register: (displayName: string, password: string) => Promise<RegisterResult>;
  signIn: (userId: string, password: string) => Promise<void>;
  signOut: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  /** Re-authenticates and generates a kit in memory; nothing is saved until commit(). */
  prepareKitRenewal: (password: string) => Promise<KitRenewal>;
  getDataKey: () => CryptoKey | null;
  getUserId: () => string | null;
  getDisplayName: () => string;
  getEnvelope: () => VaultEnvelope | null;
  refreshUsers: () => Promise<void>;
}

export const AuthCtx = createContext<AuthContextType | null>(null);
