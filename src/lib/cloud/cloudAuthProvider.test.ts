import { describe, expect, it, vi } from 'vitest';
import { createCloudAuthProvider } from './cloudAuthProvider';
import type { CloudAuthProvider } from './cloudAuthProvider';
import { readCloudCache } from './vaultCache';
import { decryptVault } from './vaultCrypto';
import { FakeCloudServer } from '../../test/fakeCloudBackend';
import type { FakeDevice } from '../../test/fakeCloudBackend';
import { MemoryStorage } from '../../test/memoryStorage';
import type { AuthSession, SignInResult } from '../auth/types';

vi.mock('../crypto/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/constants')>()),
  PBKDF2_ITERATIONS: 1_000,
  ACCOUNT_KDF_ITERATIONS: 1_000,
}));

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';
const DATA = { transactions: [{ id: 't1', description: 'Padaria São João', amount: -12.5 }], rules: [] };

interface Device {
  storage: MemoryStorage;
  backend: FakeDevice;
  provider: CloudAuthProvider;
  /** Makes this device's localStorage the global one before acting on it. */
  use(): Device;
}

function device(server: FakeCloudServer): Device {
  const storage = new MemoryStorage();
  const backend = server.device();
  const provider = createCloudAuthProvider({ backend, siteUrl: 'https://app.test/' });
  const d: Device = {
    storage,
    backend,
    provider,
    use() {
      vi.stubGlobal('localStorage', storage);
      return d;
    },
  };
  return d;
}

function dump(storage: Storage): string {
  return Array.from({ length: storage.length }, (_, i) => `${storage.key(i)}=${storage.getItem(storage.key(i)!)}`).join(
    '\n',
  );
}

function unlocked(result: SignInResult): AuthSession {
  if (result.status !== 'unlocked') throw new Error(`expected unlocked, got ${result.status}`);
  return result.session;
}

/** Creates the account, confirms the e-mail and sets up the vault on device A. */
async function setUpAccount(server: FakeCloudServer, initial: Record<string, unknown> = DATA) {
  const a = device(server).use();
  expect(await a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD })).toEqual({
    status: 'needs-email-confirmation',
    email: EMAIL,
  });
  server.confirm(EMAIL);
  expect((await a.provider.signIn({ email: EMAIL, password: PASSWORD })).status).toBe('needs-vault-setup');
  const setup = await a.provider.prepareVaultSetup();
  const session = await setup.commit(initial);
  return { a, session, setup };
}

describe('cloud sign-up and vault setup', () => {
  it('creates the account, the vault and the cache; the server never sees the password', async () => {
    const server = new FakeCloudServer();
    const { a, session, setup } = await setUpAccount(server);

    expect(setup.phrase.split(' ')).toHaveLength(12);
    const user = server.users.get(EMAIL)!;
    expect(user.authSecret).toHaveLength(43);
    expect(user.authSecret).not.toContain(PASSWORD);

    const row = server.vaults.get(user.id)!;
    expect(row).toMatchObject({ version: 0, keysVersion: 1 });
    expect(row.kitWrap?.id).toBe(setup.kitId);
    expect(JSON.stringify(row)).not.toContain('Padaria');
    expect(dump(a.storage)).toContain(`financaspro_cloud_${session.userId}_vault`);
    expect(dump(a.storage)).not.toContain('Padaria');
    expect(dump(a.storage)).not.toContain(PASSWORD);

    expect(await a.provider.createVaultStore(session).load()).toEqual(DATA);
    expect(readCloudCache(session.userId)).toMatchObject({ email: EMAIL, version: 0, dirty: false });
    expect(a.provider.getSyncStatus().state).toBe('synced');
  });

  it('answers the same for an e-mail that already exists (no enumeration)', async () => {
    const server = new FakeCloudServer();
    await setUpAccount(server);
    const other = device(server).use();
    expect(await other.provider.signUp({ displayName: 'Outro', email: EMAIL, password: 'outra senha bem longa' })).toEqual({
      status: 'needs-email-confirmation',
      email: EMAIL,
    });
  });

  it('checks the password rule before any network call', async () => {
    const server = new FakeCloudServer();
    const a = device(server).use();
    await expect(a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: 'curta' })).rejects.toThrow(
      /12 caracteres/,
    );
    await expect(a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: 'senha1234567' })).rejects.toThrow(
      /muito comum/,
    );
    expect(server.calls).toEqual([]);
  });

  it('shows the allowlist message when the e-mail is not in the beta', async () => {
    const server = new FakeCloudServer();
    server.allowlist = new Set(['outro@exemplo.com']);
    const a = device(server).use();
    await expect(a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD })).rejects.toThrow(
      /lista do beta/,
    );
  });

  it('refuses to set up a vault twice (edge: other device was faster)', async () => {
    const server = new FakeCloudServer();
    const a = device(server).use();
    await a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD });
    server.confirm(EMAIL);
    await a.provider.signIn({ email: EMAIL, password: PASSWORD });
    const setupA = await a.provider.prepareVaultSetup();

    const b = device(server).use();
    await b.provider.signIn({ email: EMAIL, password: PASSWORD });
    await (await b.provider.prepareVaultSetup()).commit({});

    a.use();
    await expect(setupA.commit(DATA)).rejects.toThrow(/já foi configurado em outro aparelho/);
  });
});

describe('cloud sign-in', () => {
  it('opens the same data on a new device', async () => {
    const server = new FakeCloudServer();
    await setUpAccount(server);
    const b = device(server).use();
    const session = unlocked(await b.provider.signIn({ email: ` ${EMAIL.toUpperCase()} `, password: PASSWORD }));
    expect(await b.provider.createVaultStore(session).load()).toEqual(DATA);
  });

  it('rejects a wrong password without writing a cache', async () => {
    const server = new FakeCloudServer();
    await setUpAccount(server);
    const b = device(server).use();
    await expect(b.provider.signIn({ email: EMAIL, password: 'senha errada qualquer' })).rejects.toThrow(
      'E-mail ou senha incorretos.',
    );
    expect(b.storage.length).toBe(0);
  });

  it('opens offline from the cache and says it is not syncing', async () => {
    const server = new FakeCloudServer();
    const { a } = await setUpAccount(server);
    await a.provider.signOut();
    server.online = false;

    const session = unlocked(await a.use().provider.signIn({ email: EMAIL, password: PASSWORD }));
    expect(await a.provider.createVaultStore(session).load()).toEqual(DATA);
    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'offline' });
  });

  it('needs internet the first time on a device', async () => {
    const server = new FakeCloudServer();
    await setUpAccount(server);
    server.online = false;
    const b = device(server).use();
    await expect(b.provider.signIn({ email: EMAIL, password: PASSWORD })).rejects.toThrow(/primeira vez/);
  });

  it('asks for the kit when the password no longer opens the data (reset by e-mail)', async () => {
    const server = new FakeCloudServer();
    await setUpAccount(server);
    const b = device(server).use();
    // What "Esqueci a senha" does on the server: new login secret, pw_wrap untouched.
    const other = createCloudAuthProvider({ backend: b.backend, siteUrl: '' });
    const newPassword = 'pastel de vento na feira';
    const { deriveAccountKeys } = await import('../crypto');
    server.users.get(EMAIL)!.authSecret = (await deriveAccountKeys(EMAIL, newPassword)).authSecret;

    expect(await other.signIn({ email: EMAIL, password: newPassword })).toEqual({ status: 'needs-kit', email: EMAIL });
    expect(b.storage.length).toBe(0);
  });

  it('keeps unsent local edits when the password was changed on another device', async () => {
    const server = new FakeCloudServer();
    const { a, session } = await setUpAccount(server);
    server.online = false; // the edit cannot be sent
    await a.provider.createVaultStore(session).save({ ...DATA, rules: [{ id: 'r-local' }] });
    await a.provider.signOut();
    server.online = true;

    const b = device(server).use();
    unlocked(await b.provider.signIn({ email: EMAIL, password: PASSWORD }));
    const newPassword = 'pastel de vento na feira';
    await b.provider.changePassword(PASSWORD, newPassword);
    await b.provider.signOut();

    // Old password still opens the cache offline-first, but the cloud refuses it.
    a.use();
    const stale = unlocked(await a.provider.signIn({ email: EMAIL, password: PASSWORD }));
    expect(a.provider.getSyncStatus()).toMatchObject({ state: 'blocked' });
    expect(a.provider.getSyncStatus().message).toMatch(/senha nova/);
    expect(readCloudCache(stale.userId)).toMatchObject({ dirty: true, version: 0 });
    await a.provider.signOut();

    const fresh = unlocked(await a.provider.signIn({ email: EMAIL, password: newPassword }));
    expect(fresh.userId).toBe(stale.userId);
    expect(await a.provider.createVaultStore(fresh).load()).toEqual({ ...DATA, rules: [{ id: 'r-local' }] });

    await a.provider.syncNow();
    expect(readCloudCache(fresh.userId)).toMatchObject({ dirty: false, version: 1 });
    const row = server.vaults.get(fresh.userId)!;
    expect(await decryptVault(fresh.dataKey, row.ciphertext)).toEqual({ ...DATA, rules: [{ id: 'r-local' }] });
  });

  it('keeps a corrupt cache aside and downloads again (edge)', async () => {
    const server = new FakeCloudServer();
    const { a, session } = await setUpAccount(server);
    await a.provider.signOut();
    a.storage.setItem(`financaspro_cloud_${session.userId}_vault`, '{corrupt');

    const reopened = unlocked(await a.use().provider.signIn({ email: EMAIL, password: PASSWORD }));
    expect(await a.provider.createVaultStore(reopened).load()).toEqual(DATA);
    const copies = Array.from({ length: a.storage.length }, (_, i) => a.storage.key(i)).filter(key =>
      key?.includes('_unreadable_'),
    );
    expect(copies).toHaveLength(1);
    expect(a.storage.getItem(copies[0]!)).toBe('{corrupt');
  });
});

describe('cloud vault store', () => {
  it('writes encrypted edits to the cache and marks them as not synced', async () => {
    const server = new FakeCloudServer();
    const { a, session } = await setUpAccount(server);
    const store = a.provider.createVaultStore(session);
    await store.save({ transactions: [{ id: 't2', description: 'Farmácia' }] });

    const cache = readCloudCache(session.userId)!;
    expect(cache.dirty).toBe(true);
    expect(cache.ciphertext).not.toContain('Farmácia');
    expect(a.provider.getSyncStatus().state).toBe('pending');
    expect(await store.load()).toEqual({ transactions: [{ id: 't2', description: 'Farmácia' }] });
  });

  it('never treats a missing cache as an empty vault', async () => {
    const server = new FakeCloudServer();
    const { a, session } = await setUpAccount(server);
    a.storage.removeItem(`financaspro_cloud_${session.userId}_vault`);
    await expect(a.provider.createVaultStore(session).load()).rejects.toMatchObject({ name: 'VaultLoadError' });
  });
});

describe('cloud password change and kit renewal', () => {
  it('changes the password: the new one works on another device, the old one does not', async () => {
    const server = new FakeCloudServer();
    const { a } = await setUpAccount(server);
    const newPassword = 'pastel de vento na feira';

    await expect(a.provider.changePassword('senha errada qualquer', newPassword)).rejects.toThrow('Senha atual incorreta.');
    await expect(a.provider.changePassword(PASSWORD, 'curta')).rejects.toThrow(/nova senha deve ter/);
    await a.provider.changePassword(PASSWORD, newPassword);
    expect(server.keyHistory.get(server.users.get(EMAIL)!.id)).toHaveLength(1);

    const b = device(server).use();
    await expect(b.provider.signIn({ email: EMAIL, password: PASSWORD })).rejects.toThrow('E-mail ou senha incorretos.');
    const session = unlocked(await b.provider.signIn({ email: EMAIL, password: newPassword }));
    expect(await b.provider.createVaultStore(session).load()).toEqual(DATA);
  });

  it('renews the kit rotating the data key atomically; stores of the old key refuse to write', async () => {
    const server = new FakeCloudServer();
    const { a, session, setup } = await setUpAccount(server);
    const oldStore = a.provider.createVaultStore(session);

    await expect(a.provider.prepareKitRenewal('senha errada qualquer')).rejects.toThrow('Senha incorreta.');
    const renewal = await a.provider.prepareKitRenewal(PASSWORD);
    expect(renewal.previousKitId).toBe(setup.kitId);
    const newKey = await renewal.commit();

    const userId = session.userId;
    const row = server.vaults.get(userId)!;
    expect(row).toMatchObject({ version: 1, keysVersion: 2 });
    expect(row.kitWrap?.id).toBe(renewal.kitId);
    expect(server.keyHistory.get(userId)![0].kitWrap?.id).toBe(setup.kitId);

    await expect(oldStore.save({})).rejects.toMatchObject({ reason: 'stale-key' });
    const newStore = a.provider.createVaultStore({ ...session, dataKey: newKey });
    expect(await newStore.load()).toEqual(DATA);
    expect(a.provider.describeKeys({ ...session, dataKey: newKey })?.kitId).toBe(renewal.kitId);

    const b = device(server).use();
    const other = unlocked(await b.provider.signIn({ email: EMAIL, password: PASSWORD }));
    expect(await b.provider.createVaultStore(other).load()).toEqual(DATA);
  });

  it('does not renew the kit when the cloud changed meanwhile (conflict)', async () => {
    const server = new FakeCloudServer();
    const { a, session } = await setUpAccount(server);
    const renewal = await a.provider.prepareKitRenewal(PASSWORD);
    server.updateVault(session.userId, row => ({ ...row, ciphertext: row.ciphertext + ' ', version: row.version + 1 }));

    await expect(renewal.commit()).rejects.toThrow(/mudaram em outro aparelho/);
    expect(server.vaults.get(session.userId)!.keysVersion).toBe(1);
    expect(await a.provider.createVaultStore(session).load()).toEqual(DATA);
  });

  it('needs internet to renew the kit and changes nothing offline', async () => {
    const server = new FakeCloudServer();
    const { a, session } = await setUpAccount(server);
    const renewal = await a.provider.prepareKitRenewal(PASSWORD);
    server.online = false;
    await expect(renewal.commit()).rejects.toThrow(/precisa de internet/);
    expect(await a.provider.createVaultStore(session).load()).toEqual(DATA);
  });

  it('describes kit-only backups for cloud accounts', async () => {
    const server = new FakeCloudServer();
    const { a, session, setup } = await setUpAccount(server);
    const info = a.provider.describeKeys(session)!;
    expect(info).toMatchObject({ kitId: setup.kitId, hasKit: true });
    expect(info.backupWraps?.password).toBeNull();
    expect(info.backupWraps?.kit?.iterations).toBe(1_000);
  });
});
