import { VaultLoadError, VaultSaveError } from '../../utils/secureStorage';
import type { VaultData, VaultStore } from '../vault';
import { preserveCloudCache, readCloudCache, updateCloudCache } from './vaultCache';
import { decryptVault, encryptVault } from './vaultCrypto';

export interface CloudVaultStoreOptions {
  userId: string;
  dataKey: CryptoKey;
  /** Called after each local write, so the sync can push it. */
  onLocalChange?: () => void;
  /** Registers a listener for data from another device written to the cache. */
  subscribeRemote?: (listener: () => void) => () => void;
}

/** Collections the app always writes; a vault without one of them means an empty list. */
const COLLECTIONS = ['transactions', 'cards', 'card_purchases', 'invoices', 'rules'];

/**
 * Same content, same string: top-level keys sorted and missing collections as [].
 * Without this, a new vault ({}) re-saved by the app as { transactions: [], ... } would
 * look like an edit on every device and create conflicts out of nothing.
 */
function canonical(data: VaultData): string {
  const filled: VaultData = { ...data };
  for (const key of COLLECTIONS) if (filled[key] === undefined) filled[key] = [];
  return JSON.stringify(Object.fromEntries(Object.entries(filled).sort(([a], [b]) => a.localeCompare(b))));
}

async function decryptOrThrow(dataKey: CryptoKey, ciphertext: string): Promise<VaultData> {
  try {
    return await decryptVault(dataKey, ciphertext);
  } catch {
    throw new VaultLoadError('decrypt', 'Os dados salvos neste aparelho não abrem com a chave desta sessão.');
  }
}

/**
 * The vault of a cloud session, read from and written to the encrypted cache on
 * this device. Sending to the cloud is the sync engine's job.
 *
 * `base` is the cloud version the data in memory came from. A save always keeps
 * the oldest base it knows, so edits made on top of old data are sent with the old
 * expected version and end in a conflict instead of overwriting newer cloud data.
 * The exception is the cache still holding exactly what this store wrote: then the
 * version it has now is the base, even if the sync pushed it in between.
 */
export function createCloudVaultStore({ userId, dataKey, onLocalChange, subscribeRemote }: CloudVaultStoreOptions): VaultStore {
  // The password wrap changes whenever the account keys change (password or kit).
  // A store created before that refuses to write, so nothing is saved with an old key.
  const wrapAtCreation = safeWrap(userId);
  let base: number | null = null;
  let lastWritten: string | null = null;
  let lastCiphertext: string | null = null;

  function readCache() {
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
    return cache;
  }

  return {
    async load(): Promise<VaultData> {
      const cache = readCache();
      const data = await decryptOrThrow(dataKey, cache.ciphertext);
      base = cache.version;
      lastWritten = canonical(data);
      lastCiphertext = cache.ciphertext;
      return data;
    },

    async save(data: VaultData): Promise<void> {
      const json = canonical(data);
      // Same content as the cache already has: writing would mark it as unsent and make
      // two open devices echo each other's saves forever.
      if (json === lastWritten) return;
      const ciphertext = await encryptVault(dataKey, data);
      updateCloudCache(userId, cache => {
        if (wrapAtCreation === null || cache.pwWrap.wrapped !== wrapAtCreation) {
          throw new VaultSaveError('stale-key', 'As chaves desta conta mudaram. Nada foi gravado com a chave antiga.');
        }
        const known = cache.ciphertext === lastCiphertext ? cache.version : base ?? cache.version;
        const version = cache.dirty ? Math.min(cache.version, known) : known;
        // Writing on top of an older version than the cache holds (newer cloud data arrived
        // and the screen was not reloaded): the vault this edit was made on top of is gone,
        // so there is no base to merge with and the user decides.
        const baseCiphertext = version === cache.version ? cache.baseCiphertext : null;
        return { ...cache, ciphertext, dirty: true, version, baseCiphertext };
      });
      lastWritten = json;
      lastCiphertext = ciphertext;
      onLocalChange?.();
    },

    async preserveUnreadable(): Promise<void> {
      preserveCloudCache(userId);
    },

    subscribeRemote,

    async reloadRemote() {
      const cache = readCache();
      if (cache.dirty) return null;
      const data = await decryptOrThrow(dataKey, cache.ciphertext);
      return {
        data,
        accept: () => {
          base = cache.version;
          lastWritten = canonical(data);
          lastCiphertext = cache.ciphertext;
        },
      };
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
