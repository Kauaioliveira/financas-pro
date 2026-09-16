import {
  createRecoveryKitWrap,
  decryptData,
  encryptData,
  normalizeKitPhrase,
  unlockRecoveryWrap,
  unwrapKeyWith,
} from '../crypto';
import { ACCOUNT_KDF_ITERATIONS } from '../crypto/constants';
import type { VaultData } from '../vault';
import type { AccountKdf, KitWrap, PasswordWrap } from './backend';

/** Derivation recorded in the vault row (docs §2). */
export function accountKdf(): AccountKdf {
  return { alg: 'PBKDF2-SHA256', iterations: ACCOUNT_KDF_ITERATIONS, salt: 'email-v1', hkdf: 'financaspro/v1' };
}

/** Wraps the data key with the recovery phrase. Recorded iterations make old kits keep opening. */
export async function createKitWrap(phrase: string, dataKey: CryptoKey, now: Date): Promise<KitWrap> {
  const wrap = await createRecoveryKitWrap(normalizeKitPhrase(phrase), dataKey, now, ACCOUNT_KDF_ITERATIONS);
  return {
    kdf: 'pbkdf2-sha256-local-v1',
    id: wrap.kitId,
    createdAt: wrap.kitCreatedAt,
    salt: wrap.recoverySalt,
    iterations: wrap.recoveryIterations,
    iv: wrap.recoveryWrapIv,
    wrapped: wrap.recoveryWrap,
  };
}

/** Data key inside a kit wrap, or null when the phrase does not open it. */
export async function openKitWrap(phrase: string, kitWrap: KitWrap): Promise<CryptoKey | null> {
  try {
    return await unlockRecoveryWrap(normalizeKitPhrase(phrase), {
      recoveryWrap: kitWrap.wrapped,
      recoveryWrapIv: kitWrap.iv,
      recoverySalt: kitWrap.salt,
      recoveryIterations: kitWrap.iterations,
    });
  } catch {
    return null;
  }
}

/** Data key inside a password wrap, or null when the wrap key is not the right one. */
export async function openPasswordWrap(pwWrapKey: CryptoKey, pwWrap: PasswordWrap): Promise<CryptoKey | null> {
  try {
    return await unwrapKeyWith(pwWrapKey, pwWrap);
  } catch {
    return null;
  }
}

export async function encryptVault(dataKey: CryptoKey, data: VaultData): Promise<string> {
  return encryptData(dataKey, JSON.stringify(data), { compress: true });
}

/** Throws when the key does not open the ciphertext or the content is not a vault object. */
export async function decryptVault(dataKey: CryptoKey, ciphertext: string): Promise<VaultData> {
  const parsed: unknown = JSON.parse(await decryptData(dataKey, ciphertext));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Conteúdo do cofre inválido.');
  }
  return parsed as VaultData;
}

export async function canDecryptVault(dataKey: CryptoKey, ciphertext: string): Promise<boolean> {
  try {
    await decryptVault(dataKey, ciphertext);
    return true;
  } catch {
    return false;
  }
}
