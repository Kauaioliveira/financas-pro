import type { SyncStatus } from '../auth/types';
import type { CloudBackend, VaultRow } from './backend';
import { CloudError, isCloudError } from './errors';
import { mergeNotice, mergeVaults } from './mergeVault';
import { readCloudCache, updateCloudCache } from './vaultCache';
import type { CloudCache } from './vaultCache';
import { canDecryptVault, decryptVault, encryptVault } from './vaultCrypto';

export const PUSH_DEBOUNCE_MS = 3_000;
export const PULL_STALE_MS = 60_000;
/** Attempts of "merge and save again" before asking the user (docs §4). */
export const MERGE_ATTEMPTS = 3;

export const UNDECRYPTABLE_REMOTE_MESSAGE =
  'Os dados na nuvem mudaram de um jeito que este aparelho não consegue abrir. Seus dados locais foram preservados. Se você gerou um kit novo em outro aparelho, saia e entre de novo.';
export const CONFLICT_MESSAGE =
  'Os dados foram alterados em outro aparelho enquanto havia alterações não enviadas neste. Escolha qual versão manter.';
const OFFLINE_MESSAGE = 'Sem conexão com a nuvem. As alterações ficam neste aparelho até a conexão voltar.';

export type ConflictChoice = 'use-remote' | 'keep-local';

export interface SyncEngineOptions {
  backend: CloudBackend;
  userId: string;
  dataKey: CryptoKey;
  deviceId: string;
  now: () => Date;
  onStatus: (status: SyncStatus) => void;
  /** Newer data from the cloud was written to the cache; the open app should reload it. */
  onRemoteApplied: () => void;
  initialStatus: SyncStatus;
}

export interface SyncEngine {
  /** Pull, then push pending edits. Runs on unlock and when the connection comes back. */
  sync(): Promise<void>;
  /** Pull only when the last check is older than PULL_STALE_MS (window focus). */
  syncIfStale(): Promise<void>;
  /** A local save happened: push after PUSH_DEBOUNCE_MS. */
  notifyLocalChange(): void;
  /** Push now (page hidden, leaving). */
  pushNow(): Promise<void>;
  resolveConflict(choice: ConflictChoice): Promise<void>;
  getStatus(): SyncStatus;
  /** Browser triggers: focus, online, visibilitychange. Returns the detach function. */
  attachBrowserTriggers(): () => void;
  stop(): void;
}

/**
 * Optimistic sync of one vault blob. Never overwrites automatically: a version
 * conflict waits for the user's choice, and a cloud copy that the session key
 * cannot decrypt never replaces the local cache.
 */
export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { backend, userId, dataKey, deviceId, now } = options;
  let status = options.initialStatus;
  let lastCheck = 0;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let stopped = false;

  function setStatus(next: Partial<SyncStatus> & Pick<SyncStatus, 'state'>): void {
    if (stopped) return;
    const cache = safeCache();
    status = { message: null, lastSyncedAt: cache?.lastSyncedAt ?? status.lastSyncedAt, ...next };
    options.onStatus(status);
  }

  function safeCache(): CloudCache | null {
    try {
      return readCloudCache(userId);
    } catch {
      return null;
    }
  }

  function requireCache(): CloudCache {
    const cache = safeCache();
    if (!cache) throw new Error('A cópia local dos dados não foi encontrada. Saia e entre de novo.');
    return cache;
  }

  function failed(err: unknown): void {
    if (isCloudError(err, 'network')) {
      setStatus({ state: 'offline', message: OFFLINE_MESSAGE });
    } else if (isCloudError(err, 'not-authenticated')) {
      setStatus({ state: 'error', message: 'Sua sessão na nuvem expirou. Saia e entre de novo para sincronizar.' });
    } else {
      setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Não foi possível sincronizar.' });
    }
  }

  /** One sync operation at a time; callers during a run wait for it and then run theirs. */
  function exclusive(task: () => Promise<void>): Promise<void> {
    const previous = running ?? Promise.resolve();
    const next = previous.then(task, task).finally(() => {
      if (running === next) running = null;
    });
    running = next;
    return next;
  }

  async function remoteOpens(row: VaultRow): Promise<boolean> {
    return canDecryptVault(dataKey, row.ciphertext);
  }

  async function pull(): Promise<void> {
    // The browser already knows: do not wait for the client's network retries.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudError('network');
    const meta = await backend.fetchVaultMeta();
    lastCheck = Date.now();
    if (!meta) {
      setStatus({ state: 'blocked', message: 'O cofre desta conta não foi encontrado na nuvem. Seus dados locais foram preservados.' });
      return;
    }
    const cache = requireCache();
    if (meta.version === cache.version) return;

    const row = await backend.fetchVault();
    if (!row) return;
    if (!(await remoteOpens(row))) {
      setStatus({ state: 'blocked', message: UNDECRYPTABLE_REMOTE_MESSAGE });
      return;
    }
    if (row.version < cache.version) return; // cache is ahead (just pushed); nothing to apply

    let applied = false;
    updateCloudCache(userId, current => {
      if (current.dirty) return current; // local edits wait for the push, which reports the conflict
      applied = true;
      // Only data and version come from the cloud. Key wraps stay as they are on this device:
      // a wrap this device cannot verify never replaces one that opens with its password.
      return {
        ...current,
        ciphertext: row.ciphertext,
        baseCiphertext: row.ciphertext,
        version: row.version,
        lastSyncedAt: now().toISOString(),
      };
    });
    if (applied) options.onRemoteApplied();
  }

  async function push(): Promise<void> {
    const cache = requireCache();
    if (!cache.dirty) return;
    const sent = cache.ciphertext;
    const newVersion = await backend.saveVault(cache.version, sent, deviceId);
    if (newVersion === null) {
      const outcome = await mergeAndSave();
      if (outcome === 'manual') setStatus({ state: 'conflict', message: CONFLICT_MESSAGE });
      return;
    }
    const updated = updateCloudCache(userId, current => ({
      ...current,
      version: newVersion,
      // What the cloud just accepted becomes the base of the next merge.
      baseCiphertext: sent,
      // Edits saved while sending stay pending, now based on the version just accepted.
      dirty: current.ciphertext !== sent,
      lastSyncedAt: now().toISOString(),
    }));
    if (updated.dirty) schedulePush();
  }

  /**
   * The vault of the other device merged with this one, or null when there is no safe
   * automatic merge: no base, a base this key no longer opens, or data the merge cannot
   * index by id. Then the user chooses, as before.
   */
  async function threeWay(cache: CloudCache, row: VaultRow): Promise<{ ciphertext: string; conflicts: number } | null> {
    if (!cache.baseCiphertext) return null;
    try {
      const [base, local, remote] = await Promise.all([
        decryptVault(dataKey, cache.baseCiphertext),
        decryptVault(dataKey, cache.ciphertext),
        decryptVault(dataKey, row.ciphertext),
      ]);
      const merged = mergeVaults(base, local, remote);
      if (!merged) return null;
      return { ciphertext: await encryptVault(dataKey, merged.data), conflicts: merged.conflicts };
    } catch {
      return null;
    }
  }

  /**
   * After a rejected save: merge the two versions and save the result, at most
   * MERGE_ATTEMPTS times. Another device saving in between, or a local edit landing
   * during the merge, costs one attempt and the merge runs again on the newer state.
   */
  async function mergeAndSave(): Promise<'merged' | 'blocked' | 'manual'> {
    let conflicts = 0;
    for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt += 1) {
      const cache = requireCache();
      if (!cache.dirty) return 'merged';
      const row = await backend.fetchVault();
      if (!row || !(await remoteOpens(row))) {
        setStatus({ state: 'blocked', message: UNDECRYPTABLE_REMOTE_MESSAGE });
        return 'blocked';
      }
      const merged = await threeWay(cache, row);
      if (!merged) return 'manual';
      conflicts += merged.conflicts;

      const version = await backend.saveVault(row.version, merged.ciphertext, deviceId);
      if (version === null) continue; // the cloud moved again: merge on top of the newer version

      const updated = updateCloudCache(userId, current =>
        current.ciphertext === cache.ciphertext
          ? {
              ...current,
              ciphertext: merged.ciphertext,
              baseCiphertext: merged.ciphertext,
              version,
              dirty: false,
              lastSyncedAt: now().toISOString(),
            }
          : // An edit landed while merging: it stays, based on the vault it was made on top
            // of, so the next attempt merges it with the cloud instead of overwriting it.
            { ...current, baseCiphertext: cache.ciphertext, version, dirty: true },
      );
      if (updated.dirty) continue;

      setStatus({ state: 'synced', message: mergeNotice(conflicts) });
      options.onRemoteApplied();
      return 'merged';
    }
    return 'manual';
  }

  function schedulePush(): void {
    if (stopped) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void pushNow();
    }, PUSH_DEBOUNCE_MS);
  }

  function settled(): void {
    if (status.state === 'blocked' || status.state === 'conflict' || status.state === 'error' || status.state === 'offline') {
      return;
    }
    const dirty = safeCache()?.dirty ?? false;
    // The merge notice survives the status refresh that follows it; a new edit clears it.
    const message = !dirty && status.state === 'synced' ? status.message : null;
    setStatus({ state: dirty ? 'pending' : 'synced', message });
  }

  function sync(): Promise<void> {
    return exclusive(async () => {
      if (stopped || status.state === 'blocked') return;
      setStatus({ state: 'syncing' });
      try {
        await pull();
        if (stopped) return;
        if ((status.state as SyncStatus['state']) === 'blocked') return;
        await push();
        if ((status.state as SyncStatus['state']) === 'syncing') setStatus({ state: 'synced' });
      } catch (err) {
        failed(err);
        return;
      }
      settled();
    });
  }

  function pushNow(): Promise<void> {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    return exclusive(async () => {
      if (stopped || status.state === 'blocked' || status.state === 'conflict') return;
      const wasOffline = status.state === 'offline';
      try {
        if (wasOffline) {
          // Coming back: check the cloud before sending anything.
          await pull();
          if ((status.state as SyncStatus['state']) === 'blocked') return;
        }
        setStatus({ state: 'syncing' });
        await push();
        if ((status.state as SyncStatus['state']) === 'syncing') setStatus({ state: 'synced' });
      } catch (err) {
        failed(err);
        return;
      }
      settled();
    });
  }

  function resolveConflict(choice: ConflictChoice): Promise<void> {
    return exclusive(async () => {
      if (stopped) return;
      setStatus({ state: 'syncing' });
      try {
        const row = await backend.fetchVault();
        if (!row || !(await remoteOpens(row))) {
          setStatus({ state: 'blocked', message: UNDECRYPTABLE_REMOTE_MESSAGE });
          return;
        }
        if (choice === 'use-remote') {
          updateCloudCache(userId, current => ({
            ...current,
            ciphertext: row.ciphertext,
            baseCiphertext: row.ciphertext,
            version: row.version,
            dirty: false,
            lastSyncedAt: now().toISOString(),
          }));
          setStatus({ state: 'synced' });
          options.onRemoteApplied();
          return;
        }
        const cache = requireCache();
        const newVersion = await backend.saveVault(row.version, cache.ciphertext, deviceId);
        if (newVersion === null) {
          setStatus({ state: 'conflict', message: CONFLICT_MESSAGE });
          return;
        }
        const sent = cache.ciphertext;
        const updated = updateCloudCache(userId, current => ({
          ...current,
          version: newVersion,
          baseCiphertext: sent,
          dirty: current.ciphertext !== sent,
          lastSyncedAt: now().toISOString(),
        }));
        setStatus({ state: updated.dirty ? 'pending' : 'synced' });
        if (updated.dirty) schedulePush();
      } catch (err) {
        if (isCloudError(err, 'network')) {
          setStatus({ state: 'conflict', message: `${CONFLICT_MESSAGE} Sem conexão agora: tente de novo quando a internet voltar.` });
          return;
        }
        failed(err);
      }
    });
  }

  function syncIfStale(): Promise<void> {
    if (Date.now() - lastCheck < PULL_STALE_MS) return Promise.resolve();
    return sync();
  }

  return {
    sync,
    syncIfStale,

    notifyLocalChange() {
      if (stopped) return;
      if (status.state === 'synced') setStatus({ state: 'pending' });
      if (status.state === 'blocked' || status.state === 'conflict') return;
      schedulePush();
    },

    pushNow,
    resolveConflict,
    getStatus: () => status,

    attachBrowserTriggers() {
      if (typeof window === 'undefined') return () => {};
      const onFocus = () => void syncIfStale();
      const onOnline = () => void sync();
      const onOffline = () => setStatus({ state: 'offline', message: OFFLINE_MESSAGE });
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') void pushNow();
      };
      window.addEventListener('focus', onFocus);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    },

    stop() {
      stopped = true;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
    },
  };
}
