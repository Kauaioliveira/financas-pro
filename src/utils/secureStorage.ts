import { encryptData, decryptData } from '../lib/crypto';

function vaultKey(userId: string): string {
  return `financaspro_${userId}_vault`;
}

export async function loadVaultData(
  userId: string,
  dataKey: CryptoKey,
): Promise<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(vaultKey(userId));
    if (!raw) return {};
    const json = await decryptData(dataKey, raw);
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveVaultData(
  userId: string,
  dataKey: CryptoKey,
  data: Record<string, unknown>,
): Promise<void> {
  const json = JSON.stringify(data);
  const encrypted = await encryptData(dataKey, json);
  try {
    localStorage.setItem(vaultKey(userId), encrypted);
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.code === 22 || err.code === 1014 || err.name === 'QuotaExceededError');
    if (!import.meta.env.PROD) {
      console.error(
        isQuota
          ? `[secureStorage] localStorage cheio ao salvar cofre. Considere exportar um backup.`
          : `[secureStorage] Erro ao salvar cofre.`,
      );
    }
  }
}

/** Raw encrypted vault as stored, or null when the user has no vault yet. */
export function readVaultCiphertext(userId: string): string | null {
  return localStorage.getItem(vaultKey(userId));
}

/**
 * Writes the raw encrypted vault and lets storage errors propagate. Use it for
 * operations that must roll back on failure (e.g. renewing the recovery kit).
 */
export function writeVaultCiphertext(userId: string, ciphertext: string | null): void {
  if (ciphertext === null) {
    localStorage.removeItem(vaultKey(userId));
  } else {
    localStorage.setItem(vaultKey(userId), ciphertext);
  }
}

export function deleteVaultData(userId: string): void {
  localStorage.removeItem(vaultKey(userId));
}

// Legacy plaintext keys (for migration detection)
export const LEGACY_KEYS = [
  'financaspro_transactions',
  'financaspro_cards',
  'financaspro_card_purchases',
  'financaspro_invoices',
  'financaspro_rules',
] as const;

export function hasLegacyData(): boolean {
  return LEGACY_KEYS.some(key => {
    try {
      const val = localStorage.getItem(key);
      return val !== null && val !== '[]';
    } catch {
      return false;
    }
  });
}

export function readLegacyData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const shortKey = key.replace('financaspro_', '');
        data[shortKey] = JSON.parse(raw);
      }
    } catch {
      // skip corrupt key
    }
  }
  return data;
}

export function clearLegacyData(): void {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  try {
    localStorage.removeItem('financaspro_user_name');
  } catch {
    // ignore
  }
}
