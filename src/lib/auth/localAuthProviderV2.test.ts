import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalAuthProviderV2 } from './localAuthProviderV2';
import { createAuthProvider } from './createAuthProvider';
import type { AuthProviderV2 } from './types';
import { recoverWithPhrase } from '../crypto';

vi.mock('../crypto/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/constants')>()),
  PBKDF2_ITERATIONS: 1_000,
}));

describe('createAuthProvider', () => {
  it('uses the local provider when cloud variables are absent', () => {
    expect(createAuthProvider().mode).toBe('local');
  });
});

describe('localAuthProviderV2', () => {
  let provider: AuthProviderV2;

  beforeEach(() => {
    localStorage.clear();
    provider = createLocalAuthProviderV2();
  });

  it('registers with a kit but does not start the session', async () => {
    const { session, kit } = await provider.register({ displayName: ' Fulano ', password: 'senha123' });
    expect(session.displayName).toBe('Fulano');
    expect(kit.phrase.split(' ')).toHaveLength(12);
    expect(kit.kitId).toMatch(/^[0-9a-f]{6}$/);

    const [account] = await provider.listLocalAccounts();
    expect(account.envelope.kitId).toBe(kit.kitId);
    expect(account.envelope.kitCreatedAt).toBe(kit.kitCreatedAt);

    await expect(provider.prepareKitRenewal('senha123')).rejects.toThrow('Sessão expirada.');
  });

  it('keeps the local password rule (minimum 6)', async () => {
    await expect(provider.register({ displayName: 'Fulano', password: '12345' })).rejects.toThrow(
      'A senha deve ter pelo menos 6 caracteres.',
    );
  });

  it('signs in, stores the vault through its store and signs out', async () => {
    const { session: created } = await provider.register({ displayName: 'Fulano', password: 'senha123' });
    const result = await provider.signIn({ userId: created.userId, password: 'senha123' });
    expect(result.status).toBe('unlocked');

    const store = provider.createVaultStore(result.session);
    await store.save({ transactions: [{ id: 't1' }] });
    expect(await store.load()).toEqual({ transactions: [{ id: 't1' }] });

    await provider.signOut();
    await expect(provider.changePassword('senha123', 'outra123')).rejects.toThrow('Sessão expirada.');
  });

  it('keeps the same error messages on sign-in', async () => {
    const { session } = await provider.register({ displayName: 'Fulano', password: 'senha123' });
    await expect(provider.signIn({ userId: session.userId, password: 'errada' })).rejects.toThrow(
      'Senha incorreta. 4 tentativas restantes.',
    );
    await expect(provider.signIn({ password: 'senha123' })).rejects.toThrow('Conta não encontrada.');
  });

  it('changes the password and returns a session whose key still opens the vault', async () => {
    const { session: created } = await provider.register({ displayName: 'Fulano', password: 'senha123' });
    const { session } = await provider.signIn({ userId: created.userId, password: 'senha123' });
    await provider.createVaultStore(session).save({ rules: [1] });

    const next = await provider.changePassword('senha123', 'novaSenha1');
    expect(await provider.createVaultStore(next).load()).toEqual({ rules: [1] });
    await expect(provider.signIn({ userId: created.userId, password: 'senha123' })).rejects.toThrow();
  });

  it('recovers with the kit (phrase typed loosely) and rejects a short new password', async () => {
    const { session, kit } = await provider.register({ displayName: 'Fulano', password: 'senha123' });

    await expect(
      provider.recoverWithKit({ userId: session.userId, phrase: kit.phrase, newPassword: '123' }),
    ).rejects.toThrow('A nova senha deve ter pelo menos 6 caracteres.');

    await provider.recoverWithKit({
      userId: session.userId,
      phrase: `  ${kit.phrase.toUpperCase()}  `,
      newPassword: 'recuperada1',
    });
    await expect(
      provider.signIn({ userId: session.userId, password: 'recuperada1' }),
    ).resolves.toMatchObject({ status: 'unlocked' });
  });

  it('renews the kit for the current session and the old phrase stops working', async () => {
    const { session: created, kit } = await provider.register({ displayName: 'Fulano', password: 'senha123' });
    const { session } = await provider.signIn({ userId: created.userId, password: 'senha123' });
    await provider.createVaultStore(session).save({ rules: [1] });

    const renewal = await provider.prepareKitRenewal('senha123');
    expect(renewal.previousKitId).toBe(kit.kitId);
    const newKey = await renewal.commit();

    expect(await provider.createVaultStore({ ...session, dataKey: newKey }).load()).toEqual({ rules: [1] });
    const [account] = await provider.listLocalAccounts();
    await expect(recoverWithPhrase(kit.phrase, 'qualquer1', account.envelope)).rejects.toThrow(
      'Frase de recuperação incorreta.',
    );
  });

  it('deletes a local account with the right password', async () => {
    const { session } = await provider.register({ displayName: 'Fulano', password: 'senha123' });
    await expect(provider.deleteLocalAccount(session.userId, 'errada')).rejects.toThrow('Senha incorreta.');
    await provider.deleteLocalAccount(session.userId, 'senha123');
    expect(await provider.listLocalAccounts()).toEqual([]);
  });
});
