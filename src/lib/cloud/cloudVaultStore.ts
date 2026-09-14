import { VaultLoadError, VaultSaveError } from '../../utils/secureStorage';
import type { VaultData, VaultStore } from '../vault';
import { preserveCloudCache, readCloudCache, updateCloudCache } from './vaultCache';
import { decryptVault, encryptVault } from './vaultCrypto';

export interface CloudVaultStoreOptions {
  userId: string;
  dataKey: CryptoKey;
  /** Called after each local write, so the sync can push it. */
  onLocalChange?: () => void;
}

/**
 * The vault of a cloud session, read from and written to the encrypted cache on
 * this device. Sending to the cloud is the sync engine's job.
 */
export function createCloudVaultStore({ userId, dataKey, onLocalChange }: CloudVaultStoreOptions): VaultStore {
  // The password wrap changes whenever the account keys change (password or kit).
  // A store created before that refuses to write, so nothing is saved with an old key.
  const wrapAtCreation = safeWrap(userId);

  return {
    async load(): Promise<VaultData> {
      let cache;
      try {
        cache = readCloudCache(userId);
      } catch (err) {
        if (err instanceof VaultLoadError) throw err;
        throw new VaultLoadError('read', 'Não foi possível ler a cópia local dos dados.');
      }
      // Unlike local accounts, a missing cache is never "empty": the session always
      // writes it before opening, so treating it as {} could push an empty vault.
      if (!cache) throw new VaultLoadError('read', 'A cópia local dos dados não foi encontrada neste aparelho.');
      try {
        return await decryptVault(dataKey, cache.ciphertext);
      } catch {
        throw new VaultLoadError('decrypt', 'Os dados salvos neste aparelho não abrem com a chave desta sessão.');
      }
    },

    async save(data: VaultData): Promise<void> {
      const ciphertext = await encryptVault(dataKey, data);
      updateCloudCache(userId, cache => {
        if (wrapAtCreation === null || cache.pwWrap.wrapped !== wrapAtCreation) {
          throw new VaultSaveError('stale-key', 'As chaves desta conta mudaram. Nada foi gravado com a chave antiga.');
        }
        return { ...cache, ciphertext, dirty: true };
      });
      onLocalChange?.();
    },

    async preserveUnreadable(): Promise<void> {
      preserveCloudCache(userId);
    },
  };
}

function safeWrap(userId: string): string | null {
  try {
    return readCloudCache(userId)?.pwWrap.wrapped ?? null;
  } catch {
    return null;
  }
}
