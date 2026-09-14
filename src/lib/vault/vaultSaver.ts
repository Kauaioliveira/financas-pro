import { VaultSaveError } from '../../utils/secureStorage';
import type { VaultData, VaultStore } from './types';

export type VaultSaverStatus =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'saving' }
  /** The store refused an old key; the data waits for the store of the new session. */
  | { state: 'waiting-store' }
  | { state: 'error'; error: VaultSaveError };

export interface VaultSaver {
  /** Debounced save of the latest data. */
  schedule(data: VaultData): void;
  /** Writes pending data now with the current store. Resolves when nothing is pending or a save failed. */
  flush(): Promise<void>;
  /** New session store (e.g. after a kit renewal). Data refused by the old store is written through it. */
  setStore(store: VaultStore): void;
  /** Tries the last failed save again. */
  retry(): Promise<void>;
  getStatus(): VaultSaverStatus;
  /** Increases on every schedule(): tells whether the data changed during an async step. */
  getRevision(): number;
  subscribe(listener: (status: VaultSaverStatus) => void): () => void;
}

function toSaveError(err: unknown): VaultSaveError {
  if (err instanceof VaultSaveError) return err;
  return new VaultSaveError(
    'write',
    'Não foi possível salvar as últimas alterações. Exporte um backup em Configurações.',
  );
}

/**
 * Serializes vault saves: one write at a time, always with the latest data and
 * the latest store. Failed data stays pending (never dropped) until a later
 * save succeeds.
 */
export function createVaultSaver(initialStore: VaultStore, debounceMs = 300): VaultSaver {
  let store = initialStore;
  let pending: VaultData | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let status: VaultSaverStatus = { state: 'idle' };
  let revision = 0;
  const listeners = new Set<(status: VaultSaverStatus) => void>();

  function setStatus(next: VaultSaverStatus): void {
    status = next;
    for (const listener of listeners) listener(next);
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function drain(): Promise<void> {
    while (pending !== null) {
      const data = pending;
      const target = store;
      pending = null;
      setStatus({ state: 'saving' });
      try {
        await target.save(data);
      } catch (err) {
        // Keep the data unless something newer arrived meanwhile.
        if (pending === null) pending = data;
        const error = toSaveError(err);
        if (error.reason === 'stale-key') {
          if (target !== store) continue; // the new store is already here
          setStatus({ state: 'waiting-store' });
        } else {
          setStatus({ state: 'error', error });
        }
        return;
      }
    }
    setStatus({ state: 'idle' });
  }

  function run(): Promise<void> {
    clearTimer();
    // A save is running: go after it, so writes never overlap and the latest data lands last.
    if (inFlight) return inFlight.then(run);
    if (pending === null || status.state === 'waiting-store') return Promise.resolve();
    inFlight = drain().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    schedule(data: VaultData): void {
      revision += 1;
      pending = data;
      clearTimer();
      if (status.state === 'waiting-store') return; // wait for setStore
      if (status.state !== 'error' && status.state !== 'saving') setStatus({ state: 'pending' });
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, debounceMs);
    },

    flush(): Promise<void> {
      if (status.state === 'waiting-store') return Promise.resolve();
      return run();
    },

    setStore(next: VaultStore): void {
      if (next === store) return;
      store = next;
      if (status.state === 'waiting-store' && pending !== null) {
        setStatus({ state: 'pending' });
        void run();
      }
    },

    retry(): Promise<void> {
      if (pending === null) return Promise.resolve();
      setStatus({ state: 'pending' });
      return run();
    },

    getStatus: () => status,
    getRevision: () => revision,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
