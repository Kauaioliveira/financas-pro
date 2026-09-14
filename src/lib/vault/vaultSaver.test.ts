import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVaultSaver } from './vaultSaver';
import { VaultSaveError } from '../../utils/secureStorage';
import type { VaultData, VaultStore } from './types';

function fakeStore(behavior: (data: VaultData) => Promise<void> = async () => {}) {
  const saved: VaultData[] = [];
  const save = vi.fn(async (data: VaultData) => {
    await behavior(data);
    saved.push(data);
  });
  const store: VaultStore = {
    load: async () => ({}),
    save,
    preserveUnreadable: async () => {},
  };
  return { store, saved, save };
}

describe('createVaultSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces and writes only the latest data', async () => {
    const a = fakeStore();
    const saver = createVaultSaver(a.store, 300);
    saver.schedule({ v: 1 });
    saver.schedule({ v: 2 });
    expect(saver.getStatus().state).toBe('pending');
    await vi.advanceTimersByTimeAsync(300);
    expect(a.saved).toEqual([{ v: 2 }]);
    expect(saver.getStatus().state).toBe('idle');
  });

  it('flush writes pending edits immediately instead of dropping them (unmount)', async () => {
    const a = fakeStore();
    const saver = createVaultSaver(a.store, 300);
    saver.schedule({ v: 1 });
    await saver.flush();
    expect(a.saved).toEqual([{ v: 1 }]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a.saved).toHaveLength(1);
  });

  it('never runs two saves at once and lands the newest data last', async () => {
    let release: () => void = () => {};
    let calls = 0;
    const a = fakeStore(() => {
      calls += 1;
      if (calls > 1) return Promise.resolve();
      return new Promise<void>(resolve => {
        release = resolve;
      });
    });
    const saver = createVaultSaver(a.store, 0);
    saver.schedule({ v: 1 });
    await vi.advanceTimersByTimeAsync(0);
    saver.schedule({ v: 2 });
    const flushed = saver.flush();
    expect(a.save).toHaveBeenCalledTimes(1);
    release();
    await flushed;
    expect(a.saved).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it('keeps failed data pending, reports the error and saves it on retry', async () => {
    let fail = true;
    const a = fakeStore(async () => {
      if (fail) throw new VaultSaveError('quota', 'Armazenamento cheio. Exporte um backup.');
    });
    const states: string[] = [];
    const saver = createVaultSaver(a.store, 300);
    saver.subscribe(status => states.push(status.state));

    saver.schedule({ v: 1 });
    await vi.advanceTimersByTimeAsync(300);
    const status = saver.getStatus();
    expect(status.state).toBe('error');
    expect(status.state === 'error' && status.error.reason).toBe('quota');
    expect(a.saved).toEqual([]);

    fail = false;
    await saver.retry();
    expect(a.saved).toEqual([{ v: 1 }]);
    expect(saver.getStatus().state).toBe('idle');
    expect(states).toContain('error');
  });

  it('wraps unknown errors in a VaultSaveError with a message for the user', async () => {
    const a = fakeStore(async () => {
      throw new Error('boom');
    });
    const saver = createVaultSaver(a.store, 0);
    saver.schedule({ v: 1 });
    await saver.flush();
    const status = saver.getStatus();
    expect(status.state === 'error' && status.error.message).toMatch(/exporte um backup/i);
  });

  it('with a stale key, waits for the new store and writes through it (never the old key)', async () => {
    const oldStore = fakeStore(async () => {
      throw new VaultSaveError('stale-key', 'stale');
    });
    const newStore = fakeStore();
    const saver = createVaultSaver(oldStore.store, 300);

    saver.schedule({ v: 1 });
    await vi.advanceTimersByTimeAsync(300);
    expect(saver.getStatus().state).toBe('waiting-store');

    // Edits made meanwhile are kept, and nothing is retried with the old store.
    saver.schedule({ v: 2 });
    await vi.advanceTimersByTimeAsync(1_000);
    await saver.flush();
    expect(oldStore.save).toHaveBeenCalledTimes(1);

    saver.setStore(newStore.store);
    await vi.advanceTimersByTimeAsync(0);
    await saver.flush();
    expect(newStore.saved).toEqual([{ v: 2 }]);
    expect(oldStore.saved).toEqual([]);
    expect(saver.getStatus().state).toBe('idle');
  });

  it('uses the store current at write time', async () => {
    const a = fakeStore();
    const b = fakeStore();
    const saver = createVaultSaver(a.store, 300);
    saver.schedule({ v: 1 });
    saver.setStore(b.store);
    await vi.advanceTimersByTimeAsync(300);
    expect(a.saved).toEqual([]);
    expect(b.saved).toEqual([{ v: 1 }]);
  });
});
