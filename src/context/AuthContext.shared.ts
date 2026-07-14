import { createContext } from 'react';
import type { AuthProvider as AuthProviderType, AuthSession, UserAccount } from '../lib/auth';
import type { VaultEnvelope } from '../lib/crypto';

export type AuthState =
  | { status: 'locked' }
  | { status: 'unlocked'; session: AuthSession };

export interface AuthContextType {
  state: AuthState;
  users: UserAccount[];
  provider: AuthProviderType;
  register: (displayName: string, password: string) => Promise<void>;
  signIn: (userId: string, password: string) => Promise<void>;
  signOut: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  getDataKey: () => CryptoKey | null;
  getUserId: () => string | null;
  getDisplayName: () => string;
  getEnvelope: () => VaultEnvelope | null;
  updateEnvelope: (envelope: VaultEnvelope) => void;
  refreshUsers: () => void;
}

export const AuthCtx = createContext<AuthContextType | null>(null);
