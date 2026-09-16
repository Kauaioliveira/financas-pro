import {
  VaultSaveError,
  loadVaultData,
  preserveUnreadableVault,
  saveVaultData,
} from '../../utils/secureStorage';
import type { VaultData, VaultStore } from './types';

export interface LocalVaultStoreOptions {
  /**
   * Checked synchronously right before each write. Return false when the
   * account no longer uses this data key (kit renewal, password change, another
   * tab): the write is refused, so the vault is never saved with an old key.
   */
  isKeyCurrent?: () => boolean;
}

/** Wrapper over secureStorage: same keys and format; errors propagate. */
export function createLocalVaultStore(
  userId: string,
  dataKey: CryptoKey,
  options: LocalVaultStoreOptions = {},
): VaultStore {
  function assertKeyCurrent(): void {
    if (options.isKeyCurrent && !options.isKeyCurrent()) {
      throw new VaultSaveError('stale-key', 'As chaves desta conta mudaram. Nada foi gravado com a chave antiga.');
    }
  }

  return {
    load(): Promise<VaultData> {
      return loadVaultData(userId, dataKey);
    },
    save(data: VaultData): Promise<void> {
      return saveVaultData(userId, dataKey, data, { beforeWrite: assertKeyCurrent });
    },
    async preserveUnreadable(): Promise<void> {
      preserveUnreadableVault(userId);
    },
  };
}
