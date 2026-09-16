import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalAuthProvider } from './localAuthProvider';
import { recoverWithPhrase } from '../crypto';
import type { VaultEnvelope } from '../crypto';
import { loadVaultData } from '../../utils/secureStorage';
import { backupWrapsFromEnvelope, exportBackupV2, importBackupV2 } from '../../utils/backup';
import legacyFixture from '../../test/fixtures/legacy-v1.json';

// An account exactly as the previous code stored it (PBKDF2 310k, no kit id).
// No iteration mock here on purpose: this is the real format.
const SLOW = 60_000;
const { account } = legacyFixture;

function seedLegacyAccount(): void {
  localStorage.setItem('financaspro_accounts', JSON.stringify([account]));
  localStorage.setItem(`financaspro_${account.id}_vault`, legacyFixture.vaultCiphertext);
}

describe('existing local account (legacy fixture)', () => {
  beforeEach(() => {
    localStorage.clear();
    seedLegacyAccount();
  });

  it('signs in with the password and loads the vault', async () => {
    const provider = createLocalAuthProvider();
    const session = await provider.signIn(account.id, legacyFixture.password);
    expect(session.displayName).toBe('Conta Legada');
    expect(await loadVaultData(account.id, session.dataKey)).toEqual(legacyFixture.expectedVault);
  }, SLOW);

  it('exports a v2 backup that opens with the original phrase and with the password', async () => {
    const provider = createLocalAuthProvider();
    const session = await provider.signIn(account.id, legacyFixture.password);
    const file = await exportBackupV2(
      JSON.stringify(legacyFixture.expectedBackup), session.dataKey, backupWrapsFromEnvelope(provider.getEnvelope(account.id) as VaultEnvelope),
    );

    expect(JSON.parse(file).wraps.kit.id).toBeNull();
    expect(await importBackupV2(file, { kind: 'kit', phrase: legacyFixture.phrase })).toEqual(
      legacyFixture.expectedBackup,
    );
    expect(
      await importBackupV2(file, { kind: 'password', password: legacyFixture.password }),
    ).toEqual(legacyFixture.expectedBackup);
  }, SLOW);

  it('renews the kit: old phrase stops working, password and data keep working', async () => {
    const provider = createLocalAuthProvider();
    const renewal = await provider.prepareKitRenewal(account.id, legacyFixture.password);
    expect(renewal.previousKitId).toBeNull();

    const newKey = await renewal.commit();
    expect(await loadVaultData(account.id, newKey)).toEqual(legacyFixture.expectedVault);

    const envelope = provider.getEnvelope(account.id) as VaultEnvelope;
    expect(envelope.kitId).toBe(renewal.kitId);
    await expect(
      recoverWithPhrase(legacyFixture.phrase, 'qualquer1', envelope),
    ).rejects.toThrow('Frase de recuperação incorreta.');

    const session = await provider.signIn(account.id, legacyFixture.password);
    expect(await loadVaultData(account.id, session.dataKey)).toEqual(legacyFixture.expectedVault);
  }, SLOW);
});
