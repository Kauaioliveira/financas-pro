import {
  createVaultEnvelope,
  unlockVault,
  changeVaultPassword,
} from '../crypto';
import type { VaultEnvelope } from '../crypto';
import type { AuthProvider, AuthSession, UserAccount } from './types';
import { deleteVaultData } from '../../utils/secureStorage';

const ACCOUNTS_KEY = 'financaspro_accounts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

interface FailureRecord {
  attempts: number;
  lockedUntil: number;
}

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createLocalAuthProvider(): AuthProvider {
  const failures = new Map<string, FailureRecord>();

  function loadAccounts(): UserAccount[] {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAccounts(accounts: UserAccount[]): void {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function recordFailure(userId: string): void {
    const existing = failures.get(userId) || { attempts: 0, lockedUntil: 0 };
    existing.attempts += 1;
    if (existing.attempts >= MAX_ATTEMPTS) {
      existing.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    failures.set(userId, existing);
  }

  function clearFailure(userId: string): void {
    failures.delete(userId);
  }

  function isLockedOut(userId: string): boolean {
    const record = failures.get(userId);
    if (!record) return false;
    if (record.lockedUntil > Date.now()) return true;
    if (record.lockedUntil > 0 && record.lockedUntil <= Date.now()) {
      failures.delete(userId);
    }
    return false;
  }

  return {
    listUsers(): UserAccount[] {
      return loadAccounts().map(a => ({ ...a }));
    },

    async register(displayName: string, password: string): Promise<AuthSession> {
      if (password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
      }

      const accounts = loadAccounts();
      const id = generateId();
      const { envelope, dataKey } = await createVaultEnvelope(password);

      const newAccount: UserAccount = {
        id,
        displayName: displayName.trim(),
        createdAt: new Date().toISOString(),
        envelope,
      };

      accounts.push(newAccount);
      saveAccounts(accounts);

      return { userId: id, displayName: newAccount.displayName, dataKey };
    },

    async signIn(userId: string, password: string): Promise<AuthSession> {
      if (isLockedOut(userId)) {
        const record = failures.get(userId)!;
        const remainingSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
        throw new Error(
          `Conta bloqueada por excesso de tentativas. Tente novamente em ${remainingSec}s.`,
        );
      }

      const accounts = loadAccounts();
      const account = accounts.find(a => a.id === userId);
      if (!account) throw new Error('Conta não encontrada.');

      let dataKey: CryptoKey;
      try {
        dataKey = await unlockVault(password, account.envelope);
      } catch {
        recordFailure(userId);
        const record = failures.get(userId)!;
        const remaining = MAX_ATTEMPTS - record.attempts;
        if (remaining <= 0) {
          throw new Error(
            `Senha incorreta. Conta bloqueada por 5 minutos.`,
          );
        }
        throw new Error(
          `Senha incorreta. ${remaining} tentativa${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`,
        );
      }

      clearFailure(userId);
      return { userId, displayName: account.displayName, dataKey };
    },

    signOut(): void {
      // dataKey is held only in memory by AuthContext; nothing to clear here.
    },

    async changePassword(
      userId: string,
      oldPassword: string,
      newPassword: string,
    ): Promise<void> {
      if (newPassword.length < 6) {
        throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
      }
      const accounts = loadAccounts();
      const idx = accounts.findIndex(a => a.id === userId);
      if (idx < 0) throw new Error('Conta não encontrada.');

      const newEnvelope = await changeVaultPassword(
        oldPassword,
        newPassword,
        accounts[idx].envelope,
      );
      accounts[idx] = { ...accounts[idx], envelope: newEnvelope };
      saveAccounts(accounts);
    },

    async deleteAccount(userId: string, password: string): Promise<void> {
      const accounts = loadAccounts();
      const account = accounts.find(a => a.id === userId);
      if (!account) throw new Error('Conta não encontrada.');

      await unlockVault(password, account.envelope);

      deleteVaultData(userId);
      saveAccounts(accounts.filter(a => a.id !== userId));
    },

    getEnvelope(userId: string): VaultEnvelope | null {
      const accounts = loadAccounts();
      const account = accounts.find(a => a.id === userId);
      return account?.envelope ?? null;
    },

    updateEnvelope(userId: string, envelope: VaultEnvelope): void {
      const accounts = loadAccounts();
      const idx = accounts.findIndex(a => a.id === userId);
      if (idx < 0) return;
      accounts[idx] = { ...accounts[idx], envelope };
      saveAccounts(accounts);
    },

    isLockedOut,
  };
}
