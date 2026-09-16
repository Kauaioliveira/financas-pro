import { describe, expect, it, vi } from 'vitest';
import {
  computeKitId,
  findWrongConfirmationWords,
  normalizeKitWord,
  pickConfirmationPositions,
  splitPhrase,
} from './kit';
import {
  addRecoveryWrap,
  createRecoveryKitWrap,
  createVaultEnvelope,
  decryptData,
  encryptData,
  generateDataKeyAsync,
  recoverWithPhrase,
  rotateVaultKey,
  unlockRecoveryWrap,
  unlockVault,
} from './crypto';
import { LEGACY_KIT_ITERATIONS } from './constants';

vi.mock('./constants', async importOriginal => ({
  ...(await importOriginal<typeof import('./constants')>()),
  PBKDF2_ITERATIONS: 1_000,
}));

const PHRASE = 'abacate cofre brisa forte janela lago milho navio pedra raiz selva tigre';

describe('computeKitId', () => {
  it('is the first 6 hex chars of SHA-256 over the wrapped bytes (fixed vector)', async () => {
    // SHA-256 of the bytes "abc" = ba7816bf...
    expect(await computeKitId(btoa('abc'))).toBe('ba7816');
  });
});

describe('pickConfirmationPositions', () => {
  it('returns 3 distinct ascending positions between 1 and 12', () => {
    for (let run = 0; run < 200; run++) {
      const positions = pickConfirmationPositions();
      expect(positions).toHaveLength(3);
      expect(new Set(positions).size).toBe(3);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      for (const p of positions) {
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(12);
      }
    }
  });

  it('can ask for every word (edge: count equals word count)', () => {
    expect(pickConfirmationPositions(4, 4)).toEqual([1, 2, 3, 4]);
  });

  it('rejects more positions than words', () => {
    expect(() => pickConfirmationPositions(2, 3)).toThrow('Mais posições pedidas');
  });
});

describe('findWrongConfirmationWords', () => {
  it('accepts the right words ignoring case, spaces and accents', () => {
    expect(normalizeKitWord('  Leão ')).toBe('leao');
    expect(findWrongConfirmationWords(PHRASE, { 1: ' ABACATE ', 5: 'janela', 12: 'Tigre' })).toEqual([]);
  });

  it('lists the positions that do not match', () => {
    expect(findWrongConfirmationWords(PHRASE, { 2: 'cofre', 3: 'barco', 7: '' })).toEqual([3, 7]);
  });

  it('treats positions outside the phrase as wrong', () => {
    expect(findWrongConfirmationWords(PHRASE, { 13: 'tigre' })).toEqual([13]);
    expect(splitPhrase(`  ${PHRASE}  `)).toHaveLength(12);
  });
});

describe('createRecoveryKitWrap / addRecoveryWrap', () => {
  it('stamps a kit id derived from the wrap and the creation date', async () => {
    const dataKey = await generateDataKeyAsync();
    const createdAt = new Date('2026-09-14T10:00:00.000Z');
    const wrap = await createRecoveryKitWrap(PHRASE, dataKey, createdAt);
    expect(wrap.kitId).toMatch(/^[0-9a-f]{6}$/);
    expect(wrap.kitId).toBe(await computeKitId(wrap.recoveryWrap));
    expect(wrap.kitCreatedAt).toBe('2026-09-14T10:00:00.000Z');
  });

  it('keeps the kit id when the phrase is used to recover (re-wrap under a new salt)', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senha123');
    const withKit = await addRecoveryWrap(PHRASE, dataKey, envelope);
    const recovered = await recoverWithPhrase(PHRASE, 'novaSenha1', withKit);
    expect(recovered.recoveryWrap).not.toBe(withKit.recoveryWrap);
    expect(recovered.kitId).toBe(withKit.kitId);
    expect(recovered.kitCreatedAt).toBe(withKit.kitCreatedAt);
  });
});

describe('kit iteration count', () => {
  it('is recorded in every new wrap and used to open it', async () => {
    const dataKey = await generateDataKeyAsync();
    const wrap = await createRecoveryKitWrap(PHRASE, dataKey, new Date(), 2_000);
    expect(wrap.recoveryIterations).toBe(2_000);
    await expect(unlockRecoveryWrap(PHRASE, wrap)).resolves.toBeDefined();
    // The wrong count is a wrong key: proves the recorded value is what opens it.
    await expect(unlockRecoveryWrap(PHRASE, { ...wrap, recoveryIterations: 1_000 })).rejects.toThrow(
      'Frase de recuperação incorreta.',
    );
  });

  it('defaults to the current local count and survives recovery and password change', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senha123');
    const withKit = await addRecoveryWrap(PHRASE, dataKey, envelope);
    expect(withKit.recoveryIterations).toBe(1_000); // PBKDF2_ITERATIONS is mocked in this file
    const recovered = await recoverWithPhrase(PHRASE, 'novaSenha1', withKit);
    expect(recovered.recoveryIterations).toBe(1_000);
  });

  it('opens kits without the field with the legacy 310k count (edge: accounts before this change)', async () => {
    expect(LEGACY_KIT_ITERATIONS).toBe(310_000);
    const dataKey = await generateDataKeyAsync();
    const { recoveryIterations, ...oldWrap } = await createRecoveryKitWrap(
      PHRASE,
      dataKey,
      new Date(),
      LEGACY_KIT_ITERATIONS,
    );
    expect(recoveryIterations).toBe(LEGACY_KIT_ITERATIONS);
    await expect(unlockRecoveryWrap(PHRASE, oldWrap)).resolves.toBeDefined();
  }, 30_000);
});

describe('rotateVaultKey', () => {
  async function setup() {
    const { envelope, dataKey } = await createVaultEnvelope('senha123');
    const withKit = await addRecoveryWrap(PHRASE, dataKey, envelope);
    const vault = await encryptData(dataKey, JSON.stringify({ transactions: [{ id: 't1' }] }));
    return { envelope: withKit, dataKey, vault };
  }

  it('switches to a new data key: new kit and password open it, the old kit does not', async () => {
    const { envelope, dataKey: oldKey, vault } = await setup();
    const newPhrase = 'barco canal delta erva farol gelo hora ilha jato lousa manta norte';
    const newKey = await generateDataKeyAsync();
    const wrap = await createRecoveryKitWrap(newPhrase, newKey);

    const next = await rotateVaultKey('senha123', envelope, { dataKey: newKey, wrap }, vault);

    expect(next.envelope.kitId).toBe(wrap.kitId);
    expect(next.vaultCiphertext).not.toBe(vault);

    const byPassword = await unlockVault('senha123', next.envelope);
    expect(JSON.parse(await decryptData(byPassword, next.vaultCiphertext!))).toEqual({
      transactions: [{ id: 't1' }],
    });

    await expect(decryptData(oldKey, next.vaultCiphertext!)).rejects.toThrow();
    await expect(recoverWithPhrase(PHRASE, 'outra123', next.envelope)).rejects.toThrow(
      'Frase de recuperação incorreta.',
    );
    const byNewKit = await recoverWithPhrase(newPhrase, 'outra123', next.envelope);
    const reopened = await unlockVault('outra123', byNewKit);
    expect(JSON.parse(await decryptData(reopened, next.vaultCiphertext!))).toEqual({
      transactions: [{ id: 't1' }],
    });
  });

  it('works for an account that has no stored vault yet', async () => {
    const { envelope } = await setup();
    const newKey = await generateDataKeyAsync();
    const wrap = await createRecoveryKitWrap(PHRASE, newKey);
    const next = await rotateVaultKey('senha123', envelope, { dataKey: newKey, wrap }, null);
    expect(next.vaultCiphertext).toBeNull();
    await expect(unlockVault('senha123', next.envelope)).resolves.toBeDefined();
  });

  it('refuses the wrong password', async () => {
    const { envelope, vault } = await setup();
    const newKey = await generateDataKeyAsync();
    const wrap = await createRecoveryKitWrap(PHRASE, newKey);
    await expect(
      rotateVaultKey('errada', envelope, { dataKey: newKey, wrap }, vault),
    ).rejects.toThrow('Senha incorreta.');
  });

  it('refuses a vault the current key cannot read, instead of re-encrypting garbage', async () => {
    const { envelope } = await setup();
    const strangerVault = await encryptData(await generateDataKeyAsync(), '{}');
    const newKey = await generateDataKeyAsync();
    const wrap = await createRecoveryKitWrap(PHRASE, newKey);
    await expect(
      rotateVaultKey('senha123', envelope, { dataKey: newKey, wrap }, strangerVault),
    ).rejects.toThrow('Não foi possível ler o cofre atual. O kit não foi trocado.');
  });
});
