import { VaultLoadError, VaultSaveError, isQuotaError } from '../../utils/secureStorage';
import { normalizeEmail } from '../crypto';
import type { AccountKdf, KitWrap, PasswordWrap } from './backend';

/**
 * Encrypted copy of the cloud vault on this device. It lets the app open offline
 * and keeps edits that were not accepted by the cloud yet. Only ciphertext and key
 * wraps are stored; e-mail and display name identify the account, as local accounts do.
 */
export interface CloudCache {
  v: 1;
  userId: string;
  /** Normalized e-mail. */
  email: string;
  displayName: string;
  kdf: AccountKdf;
  pwWrap: PasswordWrap;
  kitWrap: KitWrap | null;
  keysVersion: number;
  /** Cloud version this device last synced: the expected version of the next save. */
  version: number;
  /** Current local vault: EncryptedPayload of gzip(JSON). */
  ciphertext: string;
  /** Local ciphertext has changes the cloud has not accepted yet. */
  dirty: boolean;
  lastSyncedAt: string | null;
}

const INDEX_KEY = 'financaspro_cloud_accounts';
const DEVICE_KEY = 'financaspro_device_id';

function cacheKey(userId: string): string {
  return `financaspro_cloud_${userId}_vault`;
}

function readIndex(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function toSaveError(err: unknown): VaultSaveError {
  return isQuotaError(err)
    ? new VaultSaveError(
        'quota',
        'O armazenamento deste navegador está cheio e a cópia local não foi salva. Exporte um backup em Configurações.',
      )
    : new VaultSaveError('write', 'Não foi possível salvar a cópia local dos dados. Exporte um backup em Configurações.');
}

function isCache(value: unknown): value is CloudCache {
  const c = value as CloudCache;
  return (
    typeof c === 'object' && c !== null && c.v === 1 && typeof c.userId === 'string' &&
    typeof c.email === 'string' && typeof c.ciphertext === 'string' && typeof c.version === 'number' &&
    typeof c.keysVersion === 'number' && typeof c.pwWrap?.wrapped === 'string'
  );
}

/** The cache, null when there is none, or VaultLoadError when it exists but is unreadable. */
export function readCloudCache(userId: string): CloudCache | null {
  const raw = localStorage.getItem(cacheKey(userId));
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultLoadError('invalid-json', 'A cópia local dos dados está corrompida.');
  }
  if (!isCache(parsed)) throw new VaultLoadError('invalid-shape', 'A cópia local dos dados tem um formato inesperado.');
  return parsed;
}

export function findCloudCacheUserId(email: string): string | null {
  return readIndex()[normalizeEmail(email)] ?? null;
}

/** E-mail of the most recently written cache, to prefill the login. */
export function lastCloudEmail(): string {
  const emails = Object.keys(readIndex());
  return emails[emails.length - 1] ?? '';
}

/** Writes the cache; storage errors propagate as VaultSaveError. */
export function writeCloudCache(cache: CloudCache): void {
  try {
    localStorage.setItem(cacheKey(cache.userId), JSON.stringify(cache));
  } catch (err) {
    throw toSaveError(err);
  }
  const index = readIndex();
  if (index[cache.email] !== cache.userId) {
    delete index[cache.email];
    index[cache.email] = cache.userId;
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (err) {
      throw toSaveError(err);
    }
  }
}

/** Read-modify-write in one synchronous step, so concurrent async work cannot interleave. */
export function updateCloudCache(userId: string, change: (cache: CloudCache) => CloudCache): CloudCache {
  const current = readCloudCache(userId);
  if (!current) {
    throw new VaultSaveError('write', 'A cópia local dos dados não foi encontrada. Saia e entre de novo.');
  }
  const next = change(current);
  writeCloudCache(next);
  return next;
}

/** Keeps the raw cache under a side key before it is replaced by something else. */
export function preserveCloudCache(userId: string, now: Date = new Date()): string | null {
  const raw = localStorage.getItem(cacheKey(userId));
  if (raw === null) return null;
  const key = `${cacheKey(userId)}_unreadable_${now.getTime()}`;
  try {
    localStorage.setItem(key, raw);
  } catch (err) {
    throw isQuotaError(err)
      ? new VaultSaveError('quota', 'Não há espaço neste navegador para guardar uma cópia dos dados atuais. Nada foi alterado.')
      : new VaultSaveError('write', 'Não foi possível guardar uma cópia dos dados atuais. Nada foi alterado.');
  }
  return key;
}

/** Removes the cache (never throws). Used when a stale cache would be worse than none. */
export function removeCloudCache(userId: string): void {
  try {
    localStorage.removeItem(cacheKey(userId));
  } catch {
    // removing cannot exceed the quota; ignore other storage failures
  }
}

/** Random id of this browser, sent with saves so the owner can tell devices apart. Not secret. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'sem-id';
  }
}
