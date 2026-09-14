import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudAuthProvider } from './cloudAuthProvider';
import type { CloudAuthProvider, RecoveryResult } from './cloudAuthProvider';
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
const NEW_PASSWORD = 'pastel de vento na feira';
const DATA = { transactions: [{ id: 't1', description: 'Padaria' }], rules: [] };

interface Device {
  storage: MemoryStorage;
  backend: FakeDevice;
  provider: CloudAuthProvider;
  use(): Device;
}

const devices: Device[] = [];

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
  devices.push(d);
  return d;
}

afterEach(async () => {
  for (const d of devices.splice(0)) {
    d.use();
    await d.provider.lock();
  }
});

function unlocked(result: SignInResult | RecoveryResult): AuthSession {
  if (result.status !== 'unlocked') throw new Error(`expected unlocked, got ${result.status}`);
  return result.session;
}

async function account() {
  const server = new FakeCloudServer();
  const a = device(server).use();
  await a.provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD });
  server.confirm(EMAIL);
  await a.provider.signIn({ email: EMAIL, password: PASSWORD });
  const setup = await a.provider.prepareVaultSetup();
  const session = await setup.commit(DATA);
  await a.provider.syncNow();
  await a.provider.signOut();
  return { server, a, phrase: setup.phrase, userId: session.userId };
}

/** "Esqueci a senha" on a fresh browser: request, open the link, choose a new password. */
async function resetPassword(server: FakeCloudServer, newPassword = NEW_PASSWORD) {
  const d = device(server).use();
  await d.provider.requestPasswordReset(EMAIL);
  d.backend.openRecoveryLink(EMAIL);
  expect((await d.provider.start()).passwordRecovery).toBe(true);
  const result = await d.provider.completePasswordReset(newPassword);
  return { d, result };
}

describe('esqueci a senha', () => {
  it('answers the same whether the e-mail exists or not, and reports only a missing connection', async () => {
    const { server } = await account();
    const d = device(server).use();
    await expect(d.provider.requestPasswordReset(EMAIL)).resolves.toBeUndefined();
    await expect(d.provider.requestPasswordReset('ninguem@exemplo.com')).resolves.toBeUndefined();
    await expect(d.provider.requestPasswordReset('não é e-mail')).rejects.toThrow('Digite um e-mail válido.');
    server.online = false;
    await expect(d.provider.requestPasswordReset(EMAIL)).rejects.toMatchObject({ kind: 'network' });
  });

  it('the new password changes only the login secret: pw_wrap is untouched until the kit', async () => {
    const { server, userId } = await account();
    const before = server.vaults.get(userId)!;
    const secretBefore = server.users.get(EMAIL)!.authSecret;

    const { result } = await resetPassword(server);

    expect(result).toEqual({ status: 'needs-kit', email: EMAIL });
    expect(server.users.get(EMAIL)!.authSecret).not.toBe(secretBefore);
    const after = server.vaults.get(userId)!;
    expect(after.pwWrap).toEqual(before.pwWrap);
    expect(after.keysVersion).toBe(before.keysVersion);
    expect(server.calls).not.toContain('setPasswordWrap');
  });

  it('refuses a weak new password and a reset without the link (edge)', async () => {
    const { server } = await account();
    const d = device(server).use();
    await expect(d.provider.completePasswordReset(NEW_PASSWORD)).rejects.toThrow(/link de redefinição expirou/);
    d.backend.openRecoveryLink(EMAIL);
    await expect(d.provider.completePasswordReset('curta')).rejects.toThrow(/nova senha deve ter/);
  });
});

describe('abrir dados com o kit', () => {
  it('opens with the current kit, re-wraps the key with the new password and signs in elsewhere', async () => {
    const { server, phrase, userId } = await account();
    const { d } = await resetPassword(server);

    const session = unlocked(await d.provider.unlockWithKit(`  ${phrase.toUpperCase()} `));
    expect(await d.provider.createVaultStore(session).load()).toEqual(DATA);
    expect(server.vaults.get(userId)!.keysVersion).toBe(2);

    const other = device(server).use();
    const again = unlocked(await other.provider.signIn({ email: EMAIL, password: NEW_PASSWORD }));
    expect(await other.provider.createVaultStore(again).load()).toEqual(DATA);
  });

  it('rejects a wrong kit and changes nothing', async () => {
    const { server, phrase, userId } = await account();
    const { d } = await resetPassword(server);
    const before = server.vaults.get(userId)!;
    const wrong = phrase.split(' ').reverse().join(' ');
    await expect(d.provider.unlockWithKit(wrong)).rejects.toThrow('Kit de recuperação incorreto.');
    await expect(d.provider.unlockWithKit('poucas palavras')).rejects.toThrow('Digite as 12 palavras do kit.');
    expect(server.vaults.get(userId)).toEqual(before);
  });

  it('restores keys overwritten by someone with the e-mail, using the key history', async () => {
    const { server, phrase, userId } = await account();
    const original = server.vaults.get(userId)!;
    // Attacker: reset by e-mail, then garbage over both wraps (data untouched).
    server.overwriteKeys(userId, {
      pwWrap: { iv: 'AAAAAAAAAAAAAAAA', wrapped: 'bGl4bw==' },
      kitWrap: { ...original.kitWrap!, wrapped: 'bGl4bw==', id: 'lixo00' },
    });

    const { d, result } = await resetPassword(server);
    expect(result.status).toBe('needs-kit');
    const recovered = await d.provider.unlockWithKit(phrase);
    expect(recovered).toMatchObject({ status: 'unlocked', restoredKeys: true });
    expect(await d.provider.createVaultStore(unlocked(recovered)).load()).toEqual(DATA);
    expect(server.vaults.get(userId)!.kitWrap).toEqual(original.kitWrap); // the kit works again
  });

  it('with a kit from before a renewal, offers the data of that time and says so', async () => {
    const { server, a, phrase: oldPhrase, userId } = await account();
    a.use();
    const session = unlocked(await a.provider.signIn({ email: EMAIL, password: PASSWORD }));
    await a.provider.syncNow();
    const store = a.provider.createVaultStore(session);
    await store.load();
    const renewal = await a.provider.prepareKitRenewal(PASSWORD);
    const newKey = await renewal.commit();
    const newStore = a.provider.createVaultStore({ ...session, dataKey: newKey });
    await newStore.load();
    await newStore.save({ ...DATA, rules: [{ id: 'depois-do-kit-novo' }] });
    await a.provider.syncNow();
    await a.provider.signOut();

    const { d } = await resetPassword(server);
    const result = await d.provider.unlockWithKit(oldPhrase);
    expect(result.status).toBe('old-version');
    if (result.status !== 'old-version') return;
    expect(Date.parse(result.createdAt)).not.toBeNaN();
    // Nothing is replaced until the user confirms.
    expect(await decryptVault(newKey, server.vaults.get(userId)!.ciphertext)).toEqual({ ...DATA, rules: [{ id: 'depois-do-kit-novo' }] });

    const opened = await result.commit();
    expect(await d.provider.createVaultStore(opened).load()).toEqual(DATA);
  });

  it('"lembrei a senha antiga" re-wraps the key without the kit', async () => {
    const { server } = await account();
    const { d } = await resetPassword(server);
    await expect(d.provider.unlockWithOldPassword('outra senha qualquer')).rejects.toThrow('Essa não é a senha antiga desta conta.');
    const session = unlocked(await d.provider.unlockWithOldPassword(PASSWORD));
    expect(await d.provider.createVaultStore(session).load()).toEqual(DATA);

    await d.provider.signOut();
    unlocked(await d.provider.signIn({ email: EMAIL, password: NEW_PASSWORD }));
  });

  it('"começar do zero" creates a new key and kit; the old kit only offers the old version, marked as such', async () => {
    const { server, phrase: oldPhrase, userId } = await account();
    const { d } = await resetPassword(server);
    const fresh = await d.provider.prepareFreshKeys();
    const session = await fresh.commit({});
    expect(await d.provider.createVaultStore(session).load()).toEqual({});
    expect(server.vaults.get(userId)!.kitWrap?.id).toBe(fresh.kitId);
    await d.provider.syncNow();
    await d.provider.signOut();

    const { d: later, result: step } = await resetPassword(server, 'terceira senha bem comprida');
    expect(step.status).toBe('needs-kit');
    const result = await later.provider.unlockWithKit(oldPhrase);
    expect(result.status).toBe('old-version');
  });

  it('"restaurar de um backup" replaces the unreadable data with the backup under a new kit', async () => {
    const { server } = await account();
    const { d } = await resetPassword(server);
    const fresh = await d.provider.prepareFreshKeys();
    const backup = { transactions: [{ id: 'b1', description: 'Do backup' }], cards: [], card_purchases: [], invoices: [], rules: [] };
    const session = await fresh.commit(backup);
    expect(await d.provider.createVaultStore(session).load()).toEqual(backup);
  });
});
