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
