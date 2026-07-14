import type { VaultEnvelope } from '../crypto';

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
}
