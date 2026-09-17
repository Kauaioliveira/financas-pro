import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudAuthProvider } from './cloudAuthProvider';
import type { CloudAuthProvider } from './cloudAuthProvider';
import { mergeNotice } from './mergeVault';
import { readCloudCache, updateCloudCache } from './vaultCache';
import { decryptVault } from './vaultCrypto';
import { CONFLICT_MESSAGE, MERGE_ATTEMPTS, PUSH_DEBOUNCE_MS, UNDECRYPTABLE_REMOTE_MESSAGE } from './syncEngine';
import { FakeCloudServer } from '../../test/fakeCloudBackend';
import { MemoryStorage } from '../../test/memoryStorage';
import type { AuthSession, SignInResult } from '../auth/types';
import type { VaultData, VaultStore } from '../vault';

vi.mock('../crypto/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/constants')>()),
  PBKDF2_ITERATIONS: 1_000,
  ACCOUNT_KDF_ITERATIONS: 1_000,
}));

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';
/** The two boxes of the sign-up, ticked. */
const CONSENT = { terms: true, internationalTransfer: true };
const BASE = { transactions: [{ id: 't1', description: 'Mercado' }], rules: [] };

// Tests share one global localStorage and swap it per "device". Always let a device's
// background sync finish (await syncNow) before acting on another device.
interface Device {
  storage: MemoryStorage;
  provider: CloudAuthProvider;
  use(): Device;
}

const devices: Device[] = [];

function device(server: FakeCloudServer): Device {
  const storage = new MemoryStorage();
  const provider = createCloudAuthProvider({ backend: server.device(), siteUrl: 'https://app.test/' });
  const d: Device = {
    storage,
    provider,
    use() {
      vi.stubGlobal('localStorage', storage);
      return d;
    },
  };
  devices.push(d);
  return d;
}

afterEach(async () => {
  // Stop every sync engine so no timer outlives its test.
  for (const d of devices.splice(0)) {
    d.use();
    await d.provider.lock();
  }
  vi.useRealTimers();
});

function unlocked(result: SignInResult): AuthSession {
  if (result.status !== 'unlocked') throw new Error(`expected unlocked, got ${result.status}`);
  return result.session;
}

async function twoDevices() {
  const server = new FakeCloudServer();
  const a = device(server).use();
  await a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD, consent: CONSENT });
  server.confirm(EMAIL);
  await a.provider.signIn({ email: EMAIL, password: PASSWORD });
  const sessionA = await (await a.provider.prepareVaultSetup()).commit(BASE);
  await a.provider.syncNow();

  const b = device(server).use();
  const sessionB = unlocked(await b.provider.signIn({ email: EMAIL, password: PASSWORD }));
  await b.provider.syncNow();
  a.use();
  return { server, a, b, sessionA, sessionB, userId: sessionA.userId };
}

/** A store as the app uses it: loaded first, so it knows the base version. */
async function openStore(d: Device, session: AuthSession): Promise<VaultStore> {
  d.use();
  const store = d.provider.createVaultStore(session);
  await store.load();
  return store;
}

async function cloudData(server: FakeCloudServer, session: AuthSession) {
  return decryptVault(session.dataKey, server.vaults.get(session.userId)!.ciphertext);
}

describe('sync: push', () => {
  it('sends a local save 3 s later and reports synced', async () => {
    const { server, a, sessionA, userId } = await twoDevices();
    vi.useFakeTimers();
    const store = await openStore(a, sessionA);
    await store.save({ ...BASE, rules: [{ id: 'r1' }] });
    expect(a.provider.getSyncStatus().state).toBe('pending');
    expect(server.vaults.get(userId)!.version).toBe(0);

    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 10);
    expect(server.vaults.get(userId)!.version).toBe(0);
    await vi.advanceTimersByTimeAsync(20);
    await vi.waitFor(() => expect(server.vaults.get(userId)!.version).toBe(1));
    expect(readCloudCache(userId)).toMatchObject({ dirty: false, version: 1 });
    expect(a.provider.getSyncStatus().state).toBe('synced');
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'r1' }] });
  });

  it('does not mark anything as pending when the data did not change (no echo between devices)', async () => {
    const { a, sessionA, userId } = await twoDevices();
    const store = await openStore(a, sessionA);
    await store.save({ rules: [], transactions: [{ id: 't1', description: 'Mercado' }] });
    expect(readCloudCache(userId)?.dirty).toBe(false);
  });

  it('two devices re-saving a new empty vault in the app shape do not conflict (edge)', async () => {
    const server = new FakeCloudServer();
    const a = device(server).use();
    await a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD, consent: CONSENT });
    server.confirm(EMAIL);
    await a.provider.signIn({ email: EMAIL, password: PASSWORD });
    const sessionA = await (await a.provider.prepareVaultSetup()).commit({});
    await a.provider.syncNow();
    const b = device(server).use();
    const sessionB = unlocked(await b.provider.signIn({ email: EMAIL, password: PASSWORD }));
    await b.provider.syncNow();

    const appShape = { transactions: [], cards: [], card_purchases: [], invoices: [], rules: [] };
    for (const [d, session] of [[a, sessionA], [b, sessionB]] as const) {
      const store = await openStore(d, session);
      await store.save(appShape);
      expect(readCloudCache(session.userId)?.dirty).toBe(false);
      await d.provider.syncNow();
      expect(d.provider.getSyncStatus().state).toBe('synced');
    }
  });

  it('a second edit after a successful send is not a conflict', async () => {
    const { server, a, sessionA, userId } = await twoDevices();
    const store = await openStore(a, sessionA);
    await store.save({ ...BASE, rules: [{ id: 'r1' }] });
    await a.provider.syncNow();
    await store.save({ ...BASE, rules: [{ id: 'r1' }, { id: 'r2' }] });
    await a.provider.syncNow();

    expect(a.provider.getSyncStatus().state).toBe('synced');
    expect(readCloudCache(userId)).toMatchObject({ dirty: false, version: 2 });
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'r1' }, { id: 'r2' }] });
  });

  it('keeps edits when offline and sends them when the connection returns', async () => {
    const { server, a, sessionA, userId } = await twoDevices();
    const store = await openStore(a, sessionA);
    server.online = false;
    await store.save({ ...BASE, rules: [{ id: 'offline' }] });
    await a.provider.syncNow();
    expect(a.provider.getSyncStatus().state).toBe('offline');
    expect(readCloudCache(userId)).toMatchObject({ dirty: true, version: 0 });

    server.online = true;
    await a.provider.syncNow();
    expect(a.provider.getSyncStatus().state).toBe('synced');
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'offline' }] });
  });
});

describe('sync: pull', () => {
  it('checks only the metadata when nothing changed', async () => {
    const { server, a } = await twoDevices();
    server.calls = [];
    await a.provider.syncNow();
    expect(server.calls).toEqual(['fetchVaultMeta']);
  });

  it('applies newer cloud data when there are no local edits and tells the open app', async () => {
    const { a, b, sessionA, sessionB, userId } = await twoDevices();
    const storeA = await openStore(a, sessionA);
    const remoteApplied = vi.fn();
    storeA.subscribeRemote!(remoteApplied);

    const storeB = await openStore(b, sessionB);
    await storeB.save({ ...BASE, rules: [{ id: 'from-b' }] });
    await b.provider.syncNow();

    a.use();
    await a.provider.syncNow();
    expect(remoteApplied).toHaveBeenCalledTimes(1);
    expect(readCloudCache(userId)).toMatchObject({ version: 1, dirty: false });
    const reloaded = await storeA.reloadRemote!();
    expect(reloaded?.data).toEqual({ ...BASE, rules: [{ id: 'from-b' }] });
  });
});

describe('sync: three-way merge between devices', () => {
  /** This device edits without sending, the other device saves: the next save is rejected. */
  async function bothEdited(localData: VaultData, remoteData: VaultData) {
    const ctx = await twoDevices();
    const { server, a, b, sessionA, sessionB } = ctx;
    const storeA = await openStore(a, sessionA);
    server.online = false;
    await storeA.save(localData);
    server.online = true;

    const storeB = await openStore(b, sessionB);
    await storeB.save(remoteData);
    await b.provider.syncNow();

    a.use();
    return { ...ctx, storeA };
  }

  /** What the app always writes: the five collections, even when empty. */
  function full(data: VaultData): VaultData {
    return { transactions: [], cards: [], card_purchases: [], invoices: [], rules: [], ...data };
  }

  it('joins the changes of both devices without asking, and tells the open app', async () => {
    const { server, a, sessionA, storeA, userId } = await bothEdited(
      { ...BASE, rules: [{ id: 'from-a' }] },
      { ...BASE, rules: [{ id: 'from-b' }] },
    );
    const remoteApplied = vi.fn();
    storeA.subscribeRemote!(remoteApplied);

    await a.provider.syncNow();

    const expected = full({ ...BASE, rules: [{ id: 'from-a' }, { id: 'from-b' }] });
    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'synced', message: mergeNotice(0) });
    expect(await cloudData(server, sessionA)).toEqual(expected);
    expect(readCloudCache(userId)).toMatchObject({ dirty: false, version: 2 });
    expect(remoteApplied).toHaveBeenCalledTimes(1);
    expect((await storeA.reloadRemote!())?.data).toEqual(expected);
  });

  it('keeps this device and counts the conflict when both changed the same record', async () => {
    const { server, a, sessionA } = await bothEdited(
      { ...BASE, transactions: [{ id: 't1', description: 'Mercado do bairro' }] },
      { ...BASE, transactions: [{ id: 't1', description: 'Mercado da esquina' }] },
    );

    await a.provider.syncNow();

    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'synced', message: mergeNotice(1) });
    expect(await cloudData(server, sessionA)).toEqual(full({ transactions: [{ id: 't1', description: 'Mercado do bairro' }] }));
  });

  it('the other device sees the merged version on its next sync', async () => {
    const { a, b, sessionB } = await bothEdited(
      { ...BASE, rules: [{ id: 'from-a' }] },
      { ...BASE, rules: [{ id: 'from-b' }] },
    );
    await a.provider.syncNow();

    b.use();
    await b.provider.syncNow();
    const storeB = b.provider.createVaultStore(sessionB);
    expect(await storeB.load()).toEqual(full({ ...BASE, rules: [{ id: 'from-a' }, { id: 'from-b' }] }));
  });

  it('merges the two special collections: an invoice paid here and a rule created there', async () => {
    const { server, a, b, sessionA, sessionB } = await twoDevices();
    const start = full({ ...BASE, invoices: [{ id: 'i1', total: 100, paid: false }], rules: [{ id: 'r1', match: 'uber' }] });
    const storeA = await openStore(a, sessionA);
    await storeA.save(start);
    await a.provider.syncNow();

    b.use();
    await b.provider.syncNow();
    const storeB = await openStore(b, sessionB);

    a.use();
    await storeA.save({ ...start, invoices: [{ id: 'i1', total: 100, paid: true }] });

    b.use();
    await storeB.save({ ...start, rules: [{ id: 'r1', match: 'uber' }, { id: 'r2', match: 'ifood' }] });
    await b.provider.syncNow();

    a.use();
    await a.provider.syncNow();

    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'synced', message: mergeNotice(0) });
    expect(await cloudData(server, sessionA)).toEqual(
      full({
        ...BASE,
        invoices: [{ id: 'i1', total: 100, paid: true }],
        rules: [{ id: 'r1', match: 'uber' }, { id: 'r2', match: 'ifood' }],
      }),
    );
  });

  it('asks the user when the cache has no base (written by an older version of the app)', async () => {
    const { server, a, sessionA, userId } = await bothEdited(
      { ...BASE, rules: [{ id: 'from-a' }] },
      { ...BASE, rules: [{ id: 'from-b' }] },
    );
    updateCloudCache(userId, cache => ({ ...cache, baseCiphertext: null }));

    await a.provider.syncNow();

    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'conflict', message: CONFLICT_MESSAGE });
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'from-b' }] });
    expect(readCloudCache(userId)).toMatchObject({ dirty: true, version: 0 });
  });

  it('asks the user after three attempts when the cloud changes at every save', async () => {
    const { server, a, userId } = await bothEdited(
      { ...BASE, rules: [{ id: 'from-a' }] },
      { ...BASE, rules: [{ id: 'from-b' }] },
    );
    server.calls = [];
    // A third device saving again between every fetch and save of this one.
    server.onBeforeSave = () => {
      server.updateVault(userId, row => ({ ...row, version: row.version + 1 }));
    };

    await a.provider.syncNow();

    expect(server.calls.filter(call => call === 'saveVault')).toHaveLength(MERGE_ATTEMPTS + 1);
    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'conflict', message: CONFLICT_MESSAGE });
    expect(readCloudCache(userId)).toMatchObject({ dirty: true });
  });

  it('never merges into cloud data this device cannot open', async () => {
    const { server, a, userId } = await bothEdited(
      { ...BASE, rules: [{ id: 'from-a' }] },
      { ...BASE, rules: [{ id: 'from-b' }] },
    );
    server.updateVault(userId, row => ({
      ...row,
      ciphertext: '{"v":1,"alg":"AES-GCM","iv":"AAAAAAAAAAAAAAAA","ciphertext":"AAAA"}',
      version: row.version + 1,
    }));
    const before = readCloudCache(userId)!;

    await a.provider.syncNow();

    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'blocked', message: UNDECRYPTABLE_REMOTE_MESSAGE });
    expect(readCloudCache(userId)).toEqual(before);
  });
});

describe('sync: manual choice when the merge is not possible', () => {
  /** Both devices edited, and the cache has no base: the user decides, as before. */
  async function conflict() {
    const ctx = await twoDevices();
    const { server, a, b, sessionA, sessionB, userId } = ctx;
    const storeA = await openStore(a, sessionA);
    server.online = false;
    await storeA.save({ ...BASE, rules: [{ id: 'from-a' }] });
    server.online = true;

    const storeB = await openStore(b, sessionB);
    await storeB.save({ ...BASE, rules: [{ id: 'from-b' }] });
    await b.provider.syncNow();

    a.use();
    updateCloudCache(userId, cache => ({ ...cache, baseCiphertext: null }));
    await a.provider.syncNow();
    return { ...ctx, storeA };
  }

  it('stops at "conflict", keeps the local edits pending and leaves the cloud untouched', async () => {
    const { server, a, sessionA, userId } = await conflict();
    expect(a.provider.getSyncStatus().state).toBe('conflict');
    expect(readCloudCache(userId)).toMatchObject({ dirty: true, version: 0 });
    expect(await decryptVault(sessionA.dataKey, readCloudCache(userId)!.ciphertext)).toEqual({ ...BASE, rules: [{ id: 'from-a' }] });
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'from-b' }] });

    // Later edits and syncs do not push while the conflict is open.
    await a.provider.syncNow();
    expect(server.vaults.get(userId)!.version).toBe(1);
  });

  it('"keep this device" overwrites the cloud only after the explicit choice', async () => {
    const { server, a, b, sessionA, sessionB } = await conflict();
    await a.provider.resolveSyncConflict('keep-local');
    expect(a.provider.getSyncStatus().state).toBe('synced');
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'from-a' }] });

    b.use();
    await b.provider.syncNow();
    const storeB = b.provider.createVaultStore(sessionB);
    expect(await storeB.load()).toEqual({ ...BASE, rules: [{ id: 'from-a' }] });
  });

  it('"use the other device" discards the local edits and reloads', async () => {
    const { a, storeA, userId } = await conflict();
    const remoteApplied = vi.fn();
    storeA.subscribeRemote!(remoteApplied);
    await a.provider.resolveSyncConflict('use-remote');
    expect(remoteApplied).toHaveBeenCalled();
    expect(readCloudCache(userId)).toMatchObject({ dirty: false, version: 1 });
    expect((await storeA.reloadRemote!())?.data).toEqual({ ...BASE, rules: [{ id: 'from-b' }] });
  });

  it('an edit made on top of old data after newer data arrived becomes a conflict (edge)', async () => {
    const { server, a, b, sessionA, sessionB, userId } = await twoDevices();
    const storeA = await openStore(a, sessionA); // in memory: version 0

    const storeB = await openStore(b, sessionB);
    await storeB.save({ ...BASE, rules: [{ id: 'from-b' }] });
    await b.provider.syncNow();

    a.use();
    await a.provider.syncNow(); // cache now holds version 1, the app did not reload yet
    await storeA.save({ ...BASE, rules: [{ id: 'old-screen' }] });
    expect(readCloudCache(userId)).toMatchObject({ dirty: true, version: 0, baseCiphertext: null });
    await a.provider.syncNow();
    expect(a.provider.getSyncStatus().state).toBe('conflict');
    expect(await cloudData(server, sessionA)).toEqual({ ...BASE, rules: [{ id: 'from-b' }] });
  });
});

describe('sync: cloud data this device cannot open', () => {
  it('never replaces the cache and never pushes over it', async () => {
    const { server, a, b, sessionA, userId } = await twoDevices();
    b.use();
    await (await b.provider.prepareKitRenewal(PASSWORD)).commit(); // rotates the data key
    await b.provider.syncNow(); // let B's background sync finish before switching devices

    a.use();
    const before = readCloudCache(userId)!;
    const storeA = await openStore(a, sessionA);
    await a.provider.syncNow();
    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'blocked', message: UNDECRYPTABLE_REMOTE_MESSAGE });
    expect(readCloudCache(userId)).toEqual(before);

    server.calls = [];
    await storeA.save({ ...BASE, rules: [{ id: 'still-local' }] });
    await a.provider.syncNow();
    expect(server.calls).not.toContain('saveVault');
    expect(await storeA.load()).toEqual({ ...BASE, rules: [{ id: 'still-local' }] });
  });

  it('garbage written by someone with the e-mail session does not replace local data', async () => {
    const { server, a, userId } = await twoDevices();
    server.updateVault(userId, row => ({ ...row, ciphertext: '{"v":1,"alg":"AES-GCM","iv":"AAAAAAAAAAAAAAAA","ciphertext":"AAAA"}', version: row.version + 1 }));
    server.overwriteKeys(userId, { pwWrap: { iv: 'x', wrapped: 'lixo' }, kitWrap: null });

    const before = readCloudCache(userId)!;
    await a.provider.syncNow();
    expect(a.provider.getSyncStatus().state).toBe('blocked');
    expect(readCloudCache(userId)).toEqual(before);

    // The password still opens this device's copy.
    await a.provider.signOut();
    const session = unlocked(await a.provider.signIn({ email: EMAIL, password: PASSWORD }));
    expect(await a.provider.createVaultStore(session).load()).toEqual(BASE);
  });

  it('after a kit renewal on another device, signing in again adopts the new keys and keeps local edits', async () => {
    const { server, a, b, sessionA, userId } = await twoDevices();
    const storeA = await openStore(a, sessionA);
    server.online = false;
    await storeA.save({ ...BASE, rules: [{ id: 'from-a' }] });
    await a.provider.signOut();
    server.online = true;

    b.use();
    const newKey = await (await b.provider.prepareKitRenewal(PASSWORD)).commit();
    await b.provider.syncNow();

    a.use();
    const session = unlocked(await a.provider.signIn({ email: EMAIL, password: PASSWORD }));
    expect(readCloudCache(userId)?.keysVersion).toBe(server.vaults.get(userId)!.keysVersion);
    expect(await a.provider.createVaultStore(session).load()).toEqual({ ...BASE, rules: [{ id: 'from-a' }] });

    await a.provider.syncNow();
    expect(a.provider.getSyncStatus().state).toBe('conflict');
    await a.provider.resolveSyncConflict('keep-local');
    expect(await decryptVault(newKey, server.vaults.get(userId)!.ciphertext)).toEqual({ ...BASE, rules: [{ id: 'from-a' }] });
  });
});
