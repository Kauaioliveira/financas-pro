import { describe, expect, it } from 'vitest';
import { decryptBackup, decryptData, recoverWithPhrase, unlockVault } from './crypto';
import type { VaultEnvelope } from './crypto';
import { normalizePhrase } from './wordlist';
import legacyFixture from '../../test/fixtures/legacy-v1.json';

// The fixture was generated with the code at commit 27dd505 (PBKDF2 310k,
// VAULT_VERSION 1, recovery wrap of the original phrase) before any change in
// this branch. It stands in for the accounts people already have in localStorage.
// Never regenerate it: if these tests fail, existing accounts stopped opening.
const envelope = legacyFixture.account.envelope as VaultEnvelope;
const SLOW = 30_000;

describe('legacy v1 fixture', () => {
  it('really is the old format', () => {
    expect(envelope.v).toBe(1);
    expect(envelope.iterations).toBe(310_000);
    expect(envelope).not.toHaveProperty('kitId');
  });

  it('opens with the account password and decrypts the stored vault', async () => {
    const dataKey = await unlockVault(legacyFixture.password, envelope);
    const vault = JSON.parse(await decryptData(dataKey, legacyFixture.vaultCiphertext));
    expect(vault).toEqual(legacyFixture.expectedVault);
  }, SLOW);

  it('rejects a wrong password', async () => {
    await expect(unlockVault('senha-errada', envelope)).rejects.toThrow('Senha incorreta.');
  }, SLOW);

  it('recovers with the original phrase and keeps the same data key', async () => {
    const recovered = await recoverWithPhrase(
      normalizePhrase(legacyFixture.phrase.toUpperCase()),
      'senhaNova99',
      envelope,
    );
    const dataKey = await unlockVault('senhaNova99', recovered);
    const vault = JSON.parse(await decryptData(dataKey, legacyFixture.vaultCiphertext));
    expect(vault).toEqual(legacyFixture.expectedVault);
  }, SLOW);

  it('opens the v1 backup file with its own backup password', async () => {
    const plain = await decryptBackup(legacyFixture.backupPassword, legacyFixture.backupV1);
    expect(JSON.parse(plain)).toEqual(legacyFixture.expectedBackup);
  }, SLOW);
});
