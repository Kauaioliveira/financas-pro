import { describe, expect, it } from 'vitest';
import {
  deriveAccountKeys,
  normalizeEmail,
  toBase64Url,
  unwrapKeyWith,
  wrapKeyWith,
} from './accountKeys';
import { generateDataKeyAsync } from './crypto';
import { ACCOUNT_KDF_ITERATIONS, PBKDF2_ITERATIONS } from './constants';
import { fromBase64, subtle } from './utils';

// Fixed vectors. Generated once and cross-checked against an independent
// node:crypto implementation of the spec (PBKDF2-SHA256 + HKDF-SHA256).
// Changing them means every cloud account would stop logging in.
const VECTOR = {
  email: 'Dono@Exemplo.com ',
  password: 'correct horse battery staple',
  authSecret: 'MyGoqu9DqWLcC-TX1Xbi7sx2z4J3puoVoC2oXEIhK-s',
  authSecretAt1000: 'SAtwsVQyMIplzuN1KqLp3F3wxSOyVzKLgwHnygqD5yM',
  // HKDF "financaspro/wrap/v1" output (base64url) for the same input
  wrapBits: 'cs5oVjYPm6wqDV0vAIBLNA1Np7JXRjRH5bkVjYgUmD0',
  // dataKey raw = bytes 0..31, wrapped with pwWrapKey
  pwWrap: {
    iv: 'WpWahAOLKFRmDWqD',
    wrapped: 'MNDImYqFz5x3vKVil6QocE5n/Ush0yP2I47i+JIy3un8a7mhx2YHEzWmRAWJZHYr',
  },
};

const FAST = { iterations: 1_000 };

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

async function importWrapKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey('raw', raw.slice().buffer, 'AES-GCM', false, ['wrapKey', 'unwrapKey']);
}

async function exportRaw(key: CryptoKey): Promise<number[]> {
  return Array.from(new Uint8Array(await subtle.exportKey('raw', key)));
}

describe('production KDF parameters', () => {
  it('keeps local accounts at 310k and prepares cloud accounts at 600k', () => {
    expect(PBKDF2_ITERATIONS).toBe(310_000);
    expect(ACCOUNT_KDF_ITERATIONS).toBe(600_000);
  });
});

describe('deriveAccountKeys', () => {
  it(
    'matches the fixed vector with the production iteration count',
    async () => {
      const { authSecret, pwWrapKey } = await deriveAccountKeys(VECTOR.email, VECTOR.password);
      expect(authSecret).toBe(VECTOR.authSecret);
      expect(authSecret).toHaveLength(43);

      const dataKey = await unwrapKeyWith(pwWrapKey, VECTOR.pwWrap);
      expect(await exportRaw(dataKey)).toEqual(Array.from({ length: 32 }, (_, i) => i));
    },
    60_000,
  );

  it('matches the fixed vector when the iteration count is injected', async () => {
    const { authSecret } = await deriveAccountKeys(VECTOR.email, VECTOR.password, FAST);
    expect(authSecret).toBe(VECTOR.authSecretAt1000);
  });

  it('keeps the auth secret and the wrap key independent (the server value cannot open the wrap)', async () => {
    expect(VECTOR.authSecret).not.toBe(VECTOR.wrapBits);

    const realWrapKey = await importWrapKey(fromBase64Url(VECTOR.wrapBits));
    await expect(unwrapKeyWith(realWrapKey, VECTOR.pwWrap)).resolves.toBeDefined();

    const authAsWrapKey = await importWrapKey(fromBase64Url(VECTOR.authSecret));
    await expect(unwrapKeyWith(authAsWrapKey, VECTOR.pwWrap)).rejects.toThrow(
      'Não foi possível abrir a chave',
    );
  });

  it('normalizes e-mail case and surrounding whitespace', async () => {
    expect(normalizeEmail('  Fulano@Exemplo.COM ')).toBe('fulano@exemplo.com');
    const a = await deriveAccountKeys('  Fulano@Exemplo.COM ', 'senha', FAST);
    const b = await deriveAccountKeys('fulano@exemplo.com', 'senha', FAST);
    expect(a.authSecret).toBe(b.authSecret);
  });

  it('normalizes the password with NFKC (composed and decomposed accents match)', async () => {
    const composed = 'sença';
    const decomposed = 'sença';
    expect(composed).not.toBe(decomposed);
    const a = await deriveAccountKeys('a@b.c', composed, FAST);
    const b = await deriveAccountKeys('a@b.c', decomposed, FAST);
    expect(a.authSecret).toBe(b.authSecret);
  });

  it('produces a different secret for another password or another e-mail', async () => {
    const base = await deriveAccountKeys('a@b.c', 'senha-1', FAST);
    const otherPw = await deriveAccountKeys('a@b.c', 'senha-2', FAST);
    const otherEmail = await deriveAccountKeys('x@b.c', 'senha-1', FAST);
    expect(otherPw.authSecret).not.toBe(base.authSecret);
    expect(otherEmail.authSecret).not.toBe(base.authSecret);
  });

  it('rejects an empty e-mail or password', async () => {
    await expect(deriveAccountKeys('   ', 'senha', FAST)).rejects.toThrow('E-mail obrigatório');
    await expect(deriveAccountKeys('a@b.c', '', FAST)).rejects.toThrow('Senha obrigatória');
  });
});

describe('wrapKeyWith / unwrapKeyWith', () => {
  it('round-trips a data key', async () => {
    const { pwWrapKey } = await deriveAccountKeys('a@b.c', 'senha', FAST);
    const dataKey = await generateDataKeyAsync();
    const wrapped = await wrapKeyWith(pwWrapKey, dataKey);
    const unwrapped = await unwrapKeyWith(pwWrapKey, wrapped);
    expect(await exportRaw(unwrapped)).toEqual(await exportRaw(dataKey));
  });

  it('uses a fresh IV on every wrap', async () => {
    const { pwWrapKey } = await deriveAccountKeys('a@b.c', 'senha', FAST);
    const dataKey = await generateDataKeyAsync();
    const a = await wrapKeyWith(pwWrapKey, dataKey);
    const b = await wrapKeyWith(pwWrapKey, dataKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.wrapped).not.toBe(b.wrapped);
  });

  it('fails with a Portuguese message for the wrong password', async () => {
    const right = await deriveAccountKeys('a@b.c', 'senha-certa', FAST);
    const wrong = await deriveAccountKeys('a@b.c', 'senha-errada', FAST);
    const wrapped = await wrapKeyWith(right.pwWrapKey, await generateDataKeyAsync());
    await expect(unwrapKeyWith(wrong.pwWrapKey, wrapped)).rejects.toThrow(
      'Não foi possível abrir a chave: credencial incorreta ou dados corrompidos.',
    );
  });

  it('encodes base64url without padding or unsafe characters', () => {
    const encoded = toBase64Url(new Uint8Array([251, 255, 191, 0]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});
