import { encryptData, decryptData } from '../lib/crypto';

function vaultKey(userId: string): string {
  return `financaspro_${userId}_vault`;
}

function unreadablePrefix(userId: string): string {
  return `financaspro_${userId}_vault_unreadable_`;
}

export type VaultLoadFailure = 'read' | 'decrypt' | 'invalid-json' | 'invalid-shape';

/**
 * A vault exists but cannot be opened. Never treat this as "empty": saving over
 * it would destroy the only copy of the user's data.
 */
export class VaultLoadError extends Error {
  readonly reason: VaultLoadFailure;
  constructor(reason: VaultLoadFailure, message: string) {
    super(message);
    this.name = 'VaultLoadError';
    this.reason = reason;
  }
}

export type VaultSaveFailure = 'quota' | 'write' | 'stale-key';

export class VaultSaveError extends Error {
  readonly reason: VaultSaveFailure;
  constructor(reason: VaultSaveFailure, message: string) {
    super(message);
    this.name = 'VaultSaveError';
    this.reason = reason;
  }
}

export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.code === 22 || err.code === 1014 || err.name === 'QuotaExceededError')
  );
}

function toSaveError(err: unknown): VaultSaveError {
  if (err instanceof VaultSaveError) return err;
  return isQuotaError(err)
    ? new VaultSaveError(
        'quota',
        'O armazenamento deste navegador está cheio e as últimas alterações não foram salvas. Exporte um backup em Configurações.',
      )
    : new VaultSaveError(
        'write',
        'Não foi possível salvar as últimas alterações neste aparelho. Exporte um backup em Configurações.',
      );
}

/**
 * Returns {} only when the user has no vault yet. A vault that exists but does
 * not decrypt or parse throws VaultLoadError.
 */
export async function loadVaultData(
  userId: string,
  dataKey: CryptoKey,
): Promise<Record<string, unknown>> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(vaultKey(userId));
  } catch {
    throw new VaultLoadError('read', 'Não foi possível ler o armazenamento deste navegador.');
  }
  if (raw === null) return {};

  let json: string;
  try {
    json = await decryptData(dataKey, raw);
  } catch {
    throw new VaultLoadError('decrypt', 'Os dados salvos neste aparelho não abrem com a chave desta sessão.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VaultLoadError('invalid-json', 'Os dados salvos neste aparelho estão corrompidos.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new VaultLoadError('invalid-shape', 'Os dados salvos neste aparelho têm um formato inesperado.');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Encrypts and writes the vault. Storage errors propagate as VaultSaveError.
 * `beforeWrite` runs synchronously right before the write, after the async
 * encryption, so a caller can refuse to write with a key that became stale.
 */
export async function saveVaultData(
  userId: string,
  dataKey: CryptoKey,
  data: Record<string, unknown>,
  options: { beforeWrite?: () => void } = {},
): Promise<void> {
  const json = JSON.stringify(data);
  const encrypted = await encryptData(dataKey, json);
  options.beforeWrite?.();
  try {
    localStorage.setItem(vaultKey(userId), encrypted);
  } catch (err) {
    throw toSaveError(err);
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

/**
 * Copies a vault that does not open to a side key before the user replaces it
 * (e.g. restoring a backup). Throws when the copy cannot be written, so the
 * caller does not overwrite the only copy. Returns the side key, or null when
 * there was nothing to keep.
 */
export function preserveUnreadableVault(userId: string, now: Date = new Date()): string | null {
  const raw = localStorage.getItem(vaultKey(userId));
  if (raw === null) return null;
  const key = `${unreadablePrefix(userId)}${now.getTime()}`;
  try {
    localStorage.setItem(key, raw);
  } catch (err) {
    throw isQuotaError(err)
      ? new VaultSaveError(
          'quota',
          'Não há espaço neste navegador para guardar uma cópia dos dados que não abrem. Nada foi alterado.',
        )
      : new VaultSaveError('write', 'Não foi possível guardar uma cópia dos dados que não abrem. Nada foi alterado.');
  }
  return key;
}

export function listUnreadableVaultCopies(userId: string): string[] {
  const prefix = unreadablePrefix(userId);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys.sort();
}

export function deleteVaultData(userId: string): void {
  localStorage.removeItem(vaultKey(userId));
  for (const key of listUnreadableVaultCopies(userId)) localStorage.removeItem(key);
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

/** Removes legacy keys. Pass `only` to remove just the keys that were migrated. */
export function clearLegacyData(only?: readonly string[]): void {
  const keys = only ?? LEGACY_KEYS;
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  if (only) return;
  try {
    localStorage.removeItem('financaspro_user_name');
  } catch {
    // ignore
  }
}
