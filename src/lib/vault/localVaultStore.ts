import { loadVaultData, saveVaultData } from '../../utils/secureStorage';
import type { VaultData, VaultStore } from './types';

/** Thin wrapper over secureStorage: same keys, same format, same error handling. */
export function createLocalVaultStore(userId: string, dataKey: CryptoKey): VaultStore {
  return {
    load(): Promise<VaultData> {
      return loadVaultData(userId, dataKey);
    },
    save(data: VaultData): Promise<void> {
      return saveVaultData(userId, dataKey, data);
    },
  };
}
