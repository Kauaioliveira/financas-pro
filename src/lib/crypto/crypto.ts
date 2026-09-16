import { LEGACY_KIT_ITERATIONS, PBKDF2_ITERATIONS, SALT_BYTES, IV_BYTES, KEY_BYTES, VAULT_VERSION } from './constants';
import { getRandomBytes, toBase64, fromBase64, subtle } from './utils';
import { compress, decompress } from './compression';
import { computeKitId } from './kit';
import type { CompressionFormat } from './compression';

export interface EncryptedPayload {
  v: number;
  alg: 'AES-GCM';
  kdf: 'PBKDF2';
  iv: string;
  salt: string;
  iterations: number;
  ciphertext: string;
  /** Present when the plaintext was compressed before encryption. Absent in payloads written before v2. */
  z?: CompressionFormat;
}

export interface VaultEnvelope {
  v: number;
  salt: string;
  iterations: number;
  verifier: string;
  wrappedDataKey: string;
  wrappedDataKeyIv: string;
  recoveryWrap?: string;
  recoveryWrapIv?: string;
  recoverySalt?: string;
  /** PBKDF2 iterations of the recovery wrap. Absent in kits created before it was recorded (LEGACY_KIT_ITERATIONS). */
  recoveryIterations?: number;
  /** Short public id of the recovery kit (not secret). Absent in accounts created before renewable kits. */
  kitId?: string;
  /** ISO date the recovery kit was created (not secret). Absent in accounts created before renewable kits. */
  kitCreatedAt?: string;
}

export interface RecoveryKitWrap {
  recoveryWrap: string;
  recoveryWrapIv: string;
  recoverySalt: string;
  recoveryIterations: number;
  kitId: string;
  kitCreatedAt: string;
}

function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// --- Key derivation ---

async function deriveAuthAndVerifier(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ authKeyRaw: Uint8Array; verifier: string }> {
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: buf(salt), iterations, hash: 'SHA-256' },
    baseKey,
    KEY_BYTES * 8 * 2,
  );
  const allBytes = new Uint8Array(bits);
  const authKeyRaw = allBytes.slice(0, KEY_BYTES);
  const verifierSeed = allBytes.slice(KEY_BYTES);

  const hashBuf = await subtle.digest('SHA-256', buf(verifierSeed));
  const verifier = toBase64(new Uint8Array(hashBuf));

  return { authKeyRaw, verifier };
}

// --- AES-GCM encrypt/decrypt ---

async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = getRandomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(plaintext)),
  );
  return { ciphertext, iv };
}

async function aesGcmDecrypt(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(ciphertext)));
}

// --- Data key generation ---

export async function generateDataKeyAsync(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: KEY_BYTES * 8 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

// --- Wrap/unwrap data key ---

async function wrapDataKey(
  authKeyRaw: Uint8Array,
  dataKey: CryptoKey,
): Promise<{ wrapped: Uint8Array; iv: Uint8Array }> {
  const iv = getRandomBytes(IV_BYTES);
  const wrapKey = await subtle.importKey('raw', buf(authKeyRaw), { name: 'AES-GCM' }, false, [
    'wrapKey',
  ]);
  const wrapped = new Uint8Array(
    await subtle.wrapKey('raw', dataKey, wrapKey, { name: 'AES-GCM', iv: buf(iv) }),
  );
  return { wrapped, iv };
}

async function unwrapDataKey(
  authKeyRaw: Uint8Array,
  wrapped: Uint8Array,
  iv: Uint8Array,
): Promise<CryptoKey> {
  const unwrapKey = await subtle.importKey('raw', buf(authKeyRaw), { name: 'AES-GCM' }, false, [
    'unwrapKey',
  ]);
  return subtle.unwrapKey('raw', buf(wrapped), unwrapKey, { name: 'AES-GCM', iv: buf(iv) }, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ]);
}

// --- Vault envelope (stored per user) ---

export async function createVaultEnvelope(
  password: string,
): Promise<{ envelope: VaultEnvelope; dataKey: CryptoKey }> {
  const salt = getRandomBytes(SALT_BYTES);
  const { authKeyRaw, verifier } = await deriveAuthAndVerifier(password, salt);
  const dataKey = await generateDataKeyAsync();
  const { wrapped, iv } = await wrapDataKey(authKeyRaw, dataKey);

  return {
    envelope: {
      v: VAULT_VERSION,
      salt: toBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      verifier,
      wrappedDataKey: toBase64(wrapped),
      wrappedDataKeyIv: toBase64(iv),
    },
    dataKey,
  };
}

export async function unlockVault(
  password: string,
  envelope: VaultEnvelope,
): Promise<CryptoKey> {
  const salt = fromBase64(envelope.salt);
  const { authKeyRaw, verifier } = await deriveAuthAndVerifier(
    password,
    salt,
    envelope.iterations,
  );

  if (verifier !== envelope.verifier) {
    throw new Error('Senha incorreta.');
  }

  return unwrapDataKey(
    authKeyRaw,
    fromBase64(envelope.wrappedDataKey),
    fromBase64(envelope.wrappedDataKeyIv),
  );
}

export async function changeVaultPassword(
  oldPassword: string,
  newPassword: string,
  envelope: VaultEnvelope,
): Promise<VaultEnvelope> {
  const dataKey = await unlockVault(oldPassword, envelope);

  const newSalt = getRandomBytes(SALT_BYTES);
  const { authKeyRaw: newAuthKeyRaw, verifier: newVerifier } = await deriveAuthAndVerifier(
    newPassword,
    newSalt,
  );
  const { wrapped, iv } = await wrapDataKey(newAuthKeyRaw, dataKey);

  const next: VaultEnvelope = {
    ...envelope,
    salt: toBase64(newSalt),
    iterations: PBKDF2_ITERATIONS,
    verifier: newVerifier,
    wrappedDataKey: toBase64(wrapped),
    wrappedDataKeyIv: toBase64(iv),
  };

  if (envelope.recoveryWrap && envelope.recoveryWrapIv && envelope.recoverySalt) {
    next.recoveryWrap = envelope.recoveryWrap;
    next.recoveryWrapIv = envelope.recoveryWrapIv;
    next.recoverySalt = envelope.recoverySalt;
    if (envelope.recoveryIterations !== undefined) next.recoveryIterations = envelope.recoveryIterations;
  }

  return next;
}

// --- Recovery phrase wrap/unwrap ---

/**
 * Wraps the data key with a recovery phrase (same derivation the account has
 * always used, so RecoveryScreen keeps working) and stamps the kit id and date.
 */
export async function createRecoveryKitWrap(
  recoveryPhrase: string,
  dataKey: CryptoKey,
  createdAt: Date = new Date(),
  iterations: number = PBKDF2_ITERATIONS,
): Promise<RecoveryKitWrap> {
  const recoverySalt = getRandomBytes(SALT_BYTES);
  const { authKeyRaw } = await deriveAuthAndVerifier(recoveryPhrase, recoverySalt, iterations);
  const { wrapped, iv } = await wrapDataKey(authKeyRaw, dataKey);
  const recoveryWrap = toBase64(wrapped);

  return {
    recoveryWrap,
    recoveryWrapIv: toBase64(iv),
    recoverySalt: toBase64(recoverySalt),
    recoveryIterations: iterations,
    kitId: await computeKitId(recoveryWrap),
    kitCreatedAt: createdAt.toISOString(),
  };
}

export async function addRecoveryWrap(
  recoveryPhrase: string,
  dataKey: CryptoKey,
  envelope: VaultEnvelope,
): Promise<VaultEnvelope> {
  const kit = await createRecoveryKitWrap(recoveryPhrase, dataKey);
  return { ...envelope, ...kit };
}

/**
 * Builds the account state for a renewed kit: a NEW data key, the vault
 * re-encrypted with it, the password wrap and the kit wrap. Pure: it writes
 * nothing, so the caller can persist atomically or throw everything away.
 */
export async function rotateVaultKey(
  password: string,
  envelope: VaultEnvelope,
  kit: { dataKey: CryptoKey; wrap: RecoveryKitWrap },
  vaultCiphertext: string | null,
): Promise<{ envelope: VaultEnvelope; vaultCiphertext: string | null }> {
  const oldDataKey = await unlockVault(password, envelope);

  let nextCiphertext: string | null = null;
  if (vaultCiphertext !== null) {
    let plaintext: string;
    try {
      plaintext = await decryptData(oldDataKey, vaultCiphertext);
    } catch {
      throw new Error('Não foi possível ler o cofre atual. O kit não foi trocado.');
    }
    nextCiphertext = await encryptData(kit.dataKey, plaintext);
  }

  const salt = getRandomBytes(SALT_BYTES);
  const { authKeyRaw, verifier } = await deriveAuthAndVerifier(password, salt);
  const { wrapped, iv } = await wrapDataKey(authKeyRaw, kit.dataKey);

  return {
    envelope: {
      ...envelope,
      v: VAULT_VERSION,
      salt: toBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      verifier,
      wrappedDataKey: toBase64(wrapped),
      wrappedDataKeyIv: toBase64(iv),
      ...kit.wrap,
    },
    vaultCiphertext: nextCiphertext,
  };
}

/**
 * Opens a recovery wrap and returns the data key. The iteration count comes
 * from the wrap; kits created before it was recorded used LEGACY_KIT_ITERATIONS.
 */
export async function unlockRecoveryWrap(
  recoveryPhrase: string,
  wrap: Pick<RecoveryKitWrap, 'recoveryWrap' | 'recoveryWrapIv' | 'recoverySalt'> & {
    recoveryIterations?: number;
  },
  iterations: number = wrap.recoveryIterations ?? LEGACY_KIT_ITERATIONS,
): Promise<CryptoKey> {
  const { authKeyRaw } = await deriveAuthAndVerifier(
    recoveryPhrase,
    fromBase64(wrap.recoverySalt),
    iterations,
  );
  try {
    return await unwrapDataKey(
      authKeyRaw,
      fromBase64(wrap.recoveryWrap),
      fromBase64(wrap.recoveryWrapIv),
    );
  } catch {
    throw new Error('Frase de recuperação incorreta.');
  }
}

export async function recoverWithPhrase(
  recoveryPhrase: string,
  newPassword: string,
  envelope: VaultEnvelope,
): Promise<VaultEnvelope> {
  if (!envelope.recoveryWrap || !envelope.recoveryWrapIv || !envelope.recoverySalt) {
    throw new Error('Esta conta não possui frase de recuperação configurada.');
  }

  const dataKey = await unlockRecoveryWrap(recoveryPhrase, {
    recoveryWrap: envelope.recoveryWrap,
    recoveryWrapIv: envelope.recoveryWrapIv,
    recoverySalt: envelope.recoverySalt,
    recoveryIterations: envelope.recoveryIterations,
  });

  const newSalt = getRandomBytes(SALT_BYTES);
  const { authKeyRaw: newAuthKeyRaw, verifier: newVerifier } = await deriveAuthAndVerifier(
    newPassword,
    newSalt,
  );
  const { wrapped, iv } = await wrapDataKey(newAuthKeyRaw, dataKey);

  const newRecoverySalt = getRandomBytes(SALT_BYTES);
  const { authKeyRaw: newRecoveryKeyRaw } = await deriveAuthAndVerifier(
    recoveryPhrase,
    newRecoverySalt,
  );
  const { wrapped: newRecoveryWrapped, iv: newRecoveryIv } = await wrapDataKey(
    newRecoveryKeyRaw,
    dataKey,
  );

  return {
    ...envelope,
    salt: toBase64(newSalt),
    iterations: PBKDF2_ITERATIONS,
    verifier: newVerifier,
    wrappedDataKey: toBase64(wrapped),
    wrappedDataKeyIv: toBase64(iv),
    recoveryWrap: toBase64(newRecoveryWrapped),
    recoveryWrapIv: toBase64(newRecoveryIv),
    recoverySalt: toBase64(newRecoverySalt),
    recoveryIterations: PBKDF2_ITERATIONS,
  };
}

// --- Encrypt/decrypt user data ---

export async function encryptData(
  dataKey: CryptoKey,
  plaintext: string,
  options: { compress?: boolean } = {},
): Promise<string> {
  const encoded = new TextEncoder().encode(plaintext);
  const body = options.compress ? await compress(encoded) : encoded;
  const { ciphertext, iv } = await aesGcmEncrypt(dataKey, body);
  const payload: EncryptedPayload = {
    v: VAULT_VERSION,
    alg: 'AES-GCM',
    kdf: 'PBKDF2',
    iv: toBase64(iv),
    salt: '',
    iterations: 0,
    ciphertext: toBase64(ciphertext),
  };
  if (options.compress) payload.z = 'gzip';
  return JSON.stringify(payload);
}

export async function decryptData(
  dataKey: CryptoKey,
  encrypted: string,
): Promise<string> {
  const payload: EncryptedPayload = JSON.parse(encrypted);
  if (payload.alg !== 'AES-GCM') throw new Error('Algoritmo não suportado');
  if (payload.z !== undefined && payload.z !== 'gzip') {
    throw new Error('Compressão não suportada');
  }
  const plainBytes = await aesGcmDecrypt(
    dataKey,
    fromBase64(payload.ciphertext),
    fromBase64(payload.iv),
  );
  const body = payload.z === 'gzip' ? await decompress(plainBytes) : plainBytes;
  return new TextDecoder().decode(body);
}

// --- Encrypt/decrypt for backup file (password-based, standalone) ---

export async function encryptBackup(
  password: string,
  plaintext: string,
): Promise<string> {
  const salt = getRandomBytes(SALT_BYTES);
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const keyBits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: buf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    KEY_BYTES * 8,
  );
  const aesKey = await subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = getRandomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, aesKey, encoder.encode(plaintext)),
  );
  const payload: EncryptedPayload = {
    v: VAULT_VERSION,
    alg: 'AES-GCM',
    kdf: 'PBKDF2',
    iv: toBase64(iv),
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    ciphertext: toBase64(ciphertext),
  };
  return JSON.stringify(payload);
}

export async function decryptBackup(
  password: string,
  encrypted: string,
): Promise<string> {
  const payload: EncryptedPayload = JSON.parse(encrypted);
  if (payload.alg !== 'AES-GCM') throw new Error('Algoritmo não suportado');
  const salt = fromBase64(payload.salt);
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const keyBits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: buf(salt), iterations: payload.iterations, hash: 'SHA-256' },
    baseKey,
    KEY_BYTES * 8,
  );
  const aesKey = await subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['decrypt']);
  const plainBytes = new Uint8Array(
    await subtle.decrypt(
      { name: 'AES-GCM', iv: buf(fromBase64(payload.iv)) },
      aesKey,
      buf(fromBase64(payload.ciphertext)),
    ),
  );
  return new TextDecoder().decode(plainBytes);
}
