import { LEGACY_KEYS, clearLegacyData } from '../../utils/secureStorage';
import type { VaultData, VaultStore } from './types';

export interface LegacyMigrationResult {
  /** Legacy keys that were encrypted, verified and removed. */
  migrated: string[];
  /** Legacy keys left untouched because they could not be parsed. */
  kept: string[];
}

/**
 * Moves the plaintext data of the first app version into the encrypted vault.
 * Plaintext is removed only after the encrypted copy was written AND read back
 * with the same content. If saving or verifying fails, this throws and nothing
 * is removed.
 */
export async function migrateLegacyData(store: VaultStore): Promise<LegacyMigrationResult> {
  const data: VaultData = {};
  const migrated: string[] = [];
  const kept: string[] = [];

  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key.replace('financaspro_', '')] = JSON.parse(raw);
      migrated.push(key);
    } catch {
      kept.push(key);
    }
  }

  if (migrated.length === 0) return { migrated, kept };

  await store.save(data);

  const reloaded = await store.load();
  for (const key of migrated) {
    const shortKey = key.replace('financaspro_', '');
    if (JSON.stringify(reloaded[shortKey]) !== JSON.stringify(data[shortKey])) {
      throw new Error('Não foi possível confirmar a cópia cifrada dos dados antigos. Eles não foram apagados.');
    }
  }

  clearLegacyData(kept.length === 0 ? undefined : migrated);
  return { migrated, kept };
}
