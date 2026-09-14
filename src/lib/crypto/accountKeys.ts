import {
  ACCOUNT_AUTH_SALT_PREFIX,
  ACCOUNT_HKDF_INFO_AUTH,
  ACCOUNT_HKDF_INFO_WRAP,
  ACCOUNT_KDF_ITERATIONS,
  IV_BYTES,
  KEY_BYTES,
} from './constants';
import { fromBase64, getRandomBytes, subtle, toBase64 } from './utils';

/**
 * Key derivation v2, prepared for cloud accounts (see docs/pesquisa/deploy-e-banco-gratis-2026-09-14.md §2).
 * Local accounts do NOT use this: they keep the v1 envelope from crypto.ts.
 *
 *   authSalt   = SHA-256("financaspro/auth-salt/v1|" + emailNorm)
 *   master     = PBKDF2-SHA256(pwNorm, authSalt, 600k)
 *   authSecret = base64url(HKDF-SHA256(master, info "financaspro/auth/v1"))   -> sent to the auth server
 *   pwWrapKey  = HKDF-SHA256(master, info "financaspro/wrap/v1") as AES-GCM   -> never leaves the device
 */
export interface AccountKeys {
  authSecret: string;
  pwWrapKey: CryptoKey;
}

export interface WrappedKey {
  iv: string;
  wrapped: string;
}

function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeAccountPassword(password: string): string {
  return password.normalize('NFKC');
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function deriveAccountKeys(
  email: string,
  password: string,
  options: { iterations?: number } = {},
): Promise<AccountKeys> {
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) throw new Error('E-mail obrigatório para derivar as chaves da conta.');
  if (!password) throw new Error('Senha obrigatória para derivar as chaves da conta.');

  const encoder = new TextEncoder();
  const authSalt = new Uint8Array(
    await subtle.digest('SHA-256', buf(encoder.encode(ACCOUNT_AUTH_SALT_PREFIX + emailNorm))),
  );

  const passwordKey = await subtle.importKey(
    'raw',
    buf(encoder.encode(normalizeAccountPassword(password))),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const master = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: buf(authSalt),
      iterations: options.iterations ?? ACCOUNT_KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_BYTES * 8,
  );

  const hkdfKey = await subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const emptySalt = new ArrayBuffer(0);

  const authBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: emptySalt, info: buf(encoder.encode(ACCOUNT_HKDF_INFO_AUTH)) },
    hkdfKey,
    KEY_BYTES * 8,
  );
  const pwWrapKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: emptySalt, info: buf(encoder.encode(ACCOUNT_HKDF_INFO_WRAP)) },
    hkdfKey,
    { name: 'AES-GCM', length: KEY_BYTES * 8 },
    false,
    ['wrapKey', 'unwrapKey'],
  );

  return { authSecret: toBase64Url(new Uint8Array(authBits)), pwWrapKey };
}

/** Wraps an extractable AES-GCM key (e.g. the dataKey) with a wrapping key. */
export async function wrapKeyWith(wrappingKey: CryptoKey, key: CryptoKey): Promise<WrappedKey> {
  const iv = getRandomBytes(IV_BYTES);
  const wrapped = new Uint8Array(
    await subtle.wrapKey('raw', key, wrappingKey, { name: 'AES-GCM', iv: buf(iv) }),
  );
  return { iv: toBase64(iv), wrapped: toBase64(wrapped) };
}

/** Unwraps a key produced by wrapKeyWith. Throws a Portuguese error when the wrapping key is wrong. */
export async function unwrapKeyWith(wrappingKey: CryptoKey, wrappedKey: WrappedKey): Promise<CryptoKey> {
  try {
    return await subtle.unwrapKey(
      'raw',
      buf(fromBase64(wrappedKey.wrapped)),
      wrappingKey,
      { name: 'AES-GCM', iv: buf(fromBase64(wrappedKey.iv)) },
      'AES-GCM',
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new Error('Não foi possível abrir a chave: credencial incorreta ou dados corrompidos.');
  }
}
