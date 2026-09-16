import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudAuthProvider } from './cloudAuthProvider';
import type { CloudAuthProvider } from './cloudAuthProvider';
import { FEEDBACK_MAX_LENGTH, prepareFeedback } from './feedback';
import { FakeCloudServer } from '../../test/fakeCloudBackend';
import { MemoryStorage } from '../../test/memoryStorage';

vi.mock('../crypto/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/constants')>()),
  PBKDF2_ITERATIONS: 1_000,
  ACCOUNT_KDF_ITERATIONS: 1_000,
}));

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';
/** The two boxes of the sign-up, ticked. */
const CONSENT = { terms: true, internationalTransfer: true };

describe('prepareFeedback', () => {
  it('trims the message and keeps the screen and the version', () => {
    const result = prepareFeedback({
      kind: 'bug',
      message: '  A importação travou.  ',
      screen: 'Importar Extrato',
      appVersion: '0.0.0+2026-09-15',
    });
    expect(result).toEqual({
      feedback: { kind: 'bug', message: 'A importação travou.', screen: 'Importar Extrato', appVersion: '0.0.0+2026-09-15' },
    });
  });

  it('accepts a message at the limit (edge)', () => {
    const result = prepareFeedback({ kind: 'ideia', message: 'a'.repeat(FEEDBACK_MAX_LENGTH) });
    expect('feedback' in result && result.feedback.message).toHaveLength(FEEDBACK_MAX_LENGTH);
  });

  it('refuses a message past the limit, saying how long it is', () => {
    const result = prepareFeedback({ kind: 'ideia', message: 'a'.repeat(FEEDBACK_MAX_LENGTH + 1) });
    expect(result).toEqual({ error: `Sua opinião tem ${FEEDBACK_MAX_LENGTH + 1} caracteres. O limite é ${FEEDBACK_MAX_LENGTH}.` });
  });

  it('refuses an empty message and an unknown kind', () => {
    expect(prepareFeedback({ kind: 'bug', message: '   ' })).toEqual({ error: 'Escreva sua opinião antes de enviar.' });
    expect(prepareFeedback({ kind: 'reclamação', message: 'oi' })).toEqual({ error: 'Escolha o tipo da sua opinião.' });
  });

  it('cuts a screen name longer than the column and turns the empty ones into null', () => {
    const result = prepareFeedback({ kind: 'outro', message: 'oi', screen: 'x'.repeat(60), appVersion: '  ' });
    expect('feedback' in result && result.feedback.screen).toHaveLength(40);
    expect('feedback' in result && result.feedback.appVersion).toBeNull();
  });
});

describe('sendFeedback', () => {
  const providers: CloudAuthProvider[] = [];

  afterEach(async () => {
    for (const provider of providers.splice(0)) await provider.lock();
  });

  async function signedIn() {
    const server = new FakeCloudServer();
    vi.stubGlobal('localStorage', new MemoryStorage());
    const provider = createCloudAuthProvider({ backend: server.device(), siteUrl: 'https://app.test/' });
    providers.push(provider);
    await provider.signUp({ displayName: 'Dono', email: EMAIL, password: PASSWORD, consent: CONSENT });
    server.confirm(EMAIL);
    await provider.signIn({ email: EMAIL, password: PASSWORD });
    await (await provider.prepareVaultSetup()).commit({ transactions: [] });
    return { server, provider };
  }

  it('sends the opinion of the signed-in tester', async () => {
    const { server, provider } = await signedIn();
    await provider.sendFeedback({ kind: 'elogio', message: 'Gostei do kit.', screen: 'Dashboard', appVersion: '0.0.0' });
    expect(server.feedback).toEqual([
      { kind: 'elogio', message: 'Gostei do kit.', screen: 'Dashboard', appVersion: '0.0.0', userId: expect.any(String) },
    ]);
  });

  it('reports the failure and sends nothing when there is no connection', async () => {
    const { server, provider } = await signedIn();
    server.online = false;
    await expect(
      provider.sendFeedback({ kind: 'bug', message: 'Travou.', screen: 'Transações', appVersion: '0.0.0' }),
    ).rejects.toThrow(/sem conexão/i);
    expect(server.feedback).toHaveLength(0);
  });

  it('refuses to send without a session', async () => {
    const { server, provider } = await signedIn();
    await provider.lock();
    await expect(
      provider.sendFeedback({ kind: 'bug', message: 'Travou.', screen: 'Transações', appVersion: '0.0.0' }),
    ).rejects.toThrow();
    expect(server.feedback).toHaveLength(0);
  });
});
