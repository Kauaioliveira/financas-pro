import {
  createVaultEnvelope,
  unlockVault,
  changeVaultPassword,
  decryptData,
  generateRecoveryPhrase,
  createRecoveryKitWrap,
  generateDataKeyAsync,
  rotateVaultKey,
} from '../crypto';
import type { VaultEnvelope } from '../crypto';
import type { AuthProvider, AuthSession, KitRenewal, UserAccount } from './types';
import {
  deleteVaultData,
  readVaultCiphertext,
  writeVaultCiphertext,
} from '../../utils/secureStorage';

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

    async prepareKitRenewal(userId: string, password: string): Promise<KitRenewal> {
      const account = loadAccounts().find(a => a.id === userId);
      if (!account) throw new Error('Conta não encontrada.');

      // Re-authentication: throws "Senha incorreta." before anything is generated.
      const currentDataKey = await unlockVault(password, account.envelope);

      const phrase = generateRecoveryPhrase();
      const dataKey = await generateDataKeyAsync();
      const wrap = await createRecoveryKitWrap(phrase, dataKey);
      let committed = false;

      return {
        phrase,
        kitId: wrap.kitId,
        kitCreatedAt: wrap.kitCreatedAt,
        previousKitId: account.envelope.kitId ?? null,

        async commit(): Promise<CryptoKey> {
          if (committed) throw new Error('Este kit já foi salvo.');

          const accounts = loadAccounts();
          const idx = accounts.findIndex(a => a.id === userId);
          if (idx < 0) throw new Error('Conta não encontrada.');

          const previousVault = readVaultCiphertext(userId);
          const next = await rotateVaultKey(
            password,
            accounts[idx].envelope,
            { dataKey, wrap },
            previousVault,
          );

          // Prove the new state opens with the password and holds the same data
          // before touching storage.
          const reopenedKey = await unlockVault(password, next.envelope);
          if (previousVault !== null && next.vaultCiphertext !== null) {
            let matches = false;
            try {
              const before = await decryptData(currentDataKey, previousVault);
              const after = await decryptData(reopenedKey, next.vaultCiphertext);
              matches = before === after;
            } catch {
              matches = false;
            }
            if (!matches) {
              throw new Error('Não foi possível verificar o cofre recifrado. O kit não foi trocado.');
            }
          }

          const updatedAccounts = accounts.map((a, i) =>
            i === idx ? { ...a, envelope: next.envelope } : a,
          );

          // Vault first, account last: setItem is atomic, so if the account write
          // throws, only the vault needs to be put back.
          let vaultWritten = false;
          try {
            if (next.vaultCiphertext !== null) {
              writeVaultCiphertext(userId, next.vaultCiphertext);
              vaultWritten = true;
            }
            saveAccounts(updatedAccounts);
          } catch {
            let restored = true;
            if (vaultWritten) {
              try {
                writeVaultCiphertext(userId, previousVault);
              } catch {
                restored = false;
              }
            }
            throw new Error(
              restored
                ? 'Não foi possível salvar o kit novo. Nada foi alterado.'
                : 'Não foi possível salvar o kit novo nem desfazer a gravação. Não feche o app: exporte um backup em Configurações agora.',
            );
          }

          committed = true;
          return dataKey;
        },
      };
    },
  };
}
