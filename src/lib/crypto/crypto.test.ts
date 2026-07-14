import { describe, expect, it } from 'vitest';
import {
  createVaultEnvelope,
  unlockVault,
  changeVaultPassword,
  addRecoveryWrap,
  recoverWithPhrase,
  encryptData,
  decryptData,
  encryptBackup,
  decryptBackup,
} from './crypto';
import type { EncryptedPayload } from './crypto';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Flips one base64 character (not padding) to a different valid base64 character. */
function tamperBase64(b64: string): string {
  const idx = Math.floor(b64.length / 2);
  const original = b64[idx];
  const replacement = BASE64_CHARS.split('').find(c => c !== original && c !== '=') as string;
  return b64.slice(0, idx) + replacement + b64.slice(idx + 1);
}

describe('encryptData / decryptData', () => {
  it('round-trips arbitrary plaintext with the vault data key', async () => {
    const { dataKey } = await createVaultEnvelope('correct horse battery staple');
    const plaintext = JSON.stringify({ hello: 'world', n: 42, list: [1, 2, 3] });
    const encrypted = await encryptData(dataKey, plaintext);
    const decrypted = await decryptData(dataKey, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips empty string plaintext', async () => {
    const { dataKey } = await createVaultEnvelope('senha123456');
    const encrypted = await encryptData(dataKey, '');
    expect(await decryptData(dataKey, encrypted)).toBe('');
  });

  it('produces different ciphertext for the same plaintext across calls (random IV)', async () => {
    const { dataKey } = await createVaultEnvelope('senha123456');
    const a = await encryptData(dataKey, 'same plaintext');
    const b = await encryptData(dataKey, 'same plaintext');
    expect(a).not.toBe(b);
  });

  it('throws when the algorithm field is not AES-GCM', async () => {
    const { dataKey } = await createVaultEnvelope('senha123456');
    const encrypted = await encryptData(dataKey, 'data');
    const payload: EncryptedPayload = JSON.parse(encrypted);
    payload.alg = 'AES-CBC' as EncryptedPayload['alg'];
    await expect(decryptData(dataKey, JSON.stringify(payload))).rejects.toThrow(
      'Algoritmo não suportado',
    );
  });

  it('throws when ciphertext is tampered with (AES-GCM auth tag failure)', async () => {
    const { dataKey } = await createVaultEnvelope('senha123456');
    const encrypted = await encryptData(dataKey, 'sensitive data');
    const payload: EncryptedPayload = JSON.parse(encrypted);
    payload.ciphertext = tamperBase64(payload.ciphertext);
    await expect(decryptData(dataKey, JSON.stringify(payload))).rejects.toThrow();
  });
});

describe('createVaultEnvelope / unlockVault', () => {
  it('unlocks with the correct password and returns a usable data key', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('minhasenha');
    const unlockedKey = await unlockVault('minhasenha', envelope);

    const encrypted = await encryptData(dataKey, 'round trip through unlocked key');
    expect(await decryptData(unlockedKey, encrypted)).toBe('round trip through unlocked key');
  });

  it('throws the Portuguese wrong-password error for an incorrect password', async () => {
    const { envelope } = await createVaultEnvelope('minhasenha');
    await expect(unlockVault('senhaerrada', envelope)).rejects.toThrow('Senha incorreta.');
  });
});

describe('changeVaultPassword', () => {
  it('requires the correct old password', async () => {
    const { envelope } = await createVaultEnvelope('senhaantiga');
    await expect(
      changeVaultPassword('senhaerrada', 'senhanova123', envelope),
    ).rejects.toThrow('Senha incorreta.');
  });

  it('old password stops working and new password works after change', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senhaantiga');
    const newEnvelope = await changeVaultPassword('senhaantiga', 'senhanova123', envelope);

    await expect(unlockVault('senhaantiga', newEnvelope)).rejects.toThrow('Senha incorreta.');

    const unlockedKey = await unlockVault('senhanova123', newEnvelope);
    const encrypted = await encryptData(dataKey, 'still works');
    expect(await decryptData(unlockedKey, encrypted)).toBe('still works');
  });

  it('preserves the data key across the password change', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senhaantiga');
    const encryptedBeforeChange = await encryptData(dataKey, 'preserved payload');

    const newEnvelope = await changeVaultPassword('senhaantiga', 'senhanova123', envelope);
    const unlockedKey = await unlockVault('senhanova123', newEnvelope);

    expect(await decryptData(unlockedKey, encryptedBeforeChange)).toBe('preserved payload');
  });
});

describe('recovery phrase', () => {
  it('throws when no recovery is configured', async () => {
    const { envelope } = await createVaultEnvelope('senha123456');
    await expect(
      recoverWithPhrase('some recovery phrase', 'novasenha123', envelope),
    ).rejects.toThrow('Esta conta não possui frase de recuperação configurada.');
  });

  it('throws on a wrong recovery phrase', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senha123456');
    const withRecovery = await addRecoveryWrap('correct recovery phrase words here', dataKey, envelope);

    await expect(
      recoverWithPhrase('totally wrong phrase', 'novasenha123', withRecovery),
    ).rejects.toThrow('Frase de recuperação incorreta.');
  });

  it('unlocks with the new password after a correct recovery', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senha123456');
    const recoveryPhrase = 'correct recovery phrase words here';
    const withRecovery = await addRecoveryWrap(recoveryPhrase, dataKey, envelope);

    const recovered = await recoverWithPhrase(recoveryPhrase, 'novasenha123', withRecovery);

    const unlockedKey = await unlockVault('novasenha123', recovered);
    const encrypted = await encryptData(dataKey, 'recovered payload');
    expect(await decryptData(unlockedKey, encrypted)).toBe('recovered payload');

    // Old password no longer works.
    await expect(unlockVault('senha123456', recovered)).rejects.toThrow('Senha incorreta.');
  });

  it('re-wraps the recovery phrase under a fresh salt after recovery, and it remains usable a second time', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senha123456');
    const recoveryPhrase = 'correct recovery phrase words here';
    const withRecovery = await addRecoveryWrap(recoveryPhrase, dataKey, envelope);

    const recoveredOnce = await recoverWithPhrase(recoveryPhrase, 'novasenha123', withRecovery);

    // Salt/wrap rotated even though the phrase text is unchanged.
    expect(recoveredOnce.recoverySalt).not.toBe(withRecovery.recoverySalt);
    expect(recoveredOnce.recoveryWrap).not.toBe(withRecovery.recoveryWrap);

    // The same recovery phrase still works for a second recovery.
    const recoveredTwice = await recoverWithPhrase(recoveryPhrase, 'outraSenha456', recoveredOnce);
    const unlockedKey = await unlockVault('outraSenha456', recoveredTwice);
    const encrypted = await encryptData(dataKey, 'second recovery payload');
    expect(await decryptData(unlockedKey, encrypted)).toBe('second recovery payload');
  });
});

describe('encryptBackup / decryptBackup', () => {
  it('round-trips plaintext with the same password', async () => {
    const plaintext = JSON.stringify({ transactions: [1, 2, 3] });
    const encrypted = await encryptBackup('backupPassword1', plaintext);
    const decrypted = await decryptBackup('backupPassword1', encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('throws on a wrong password', async () => {
    const encrypted = await encryptBackup('backupPassword1', 'segredo');
    await expect(decryptBackup('senhaErrada', encrypted)).rejects.toThrow();
  });

  it('throws on a malformed algorithm field', async () => {
    const encrypted = await encryptBackup('backupPassword1', 'segredo');
    const payload: EncryptedPayload = JSON.parse(encrypted);
    payload.alg = 'ROT13' as EncryptedPayload['alg'];
    await expect(decryptBackup('backupPassword1', JSON.stringify(payload))).rejects.toThrow(
      'Algoritmo não suportado',
    );
  });
});
