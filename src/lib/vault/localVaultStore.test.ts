import { describe, expect, it } from 'vitest';
import { createLocalVaultStore } from './localVaultStore';
import { generateDataKeyAsync } from '../crypto';
import { loadVaultData, saveVaultData } from '../../utils/secureStorage';
import legacyFixture from '../../test/fixtures/legacy-v1.json';
import { unlockVault } from '../crypto';
import type { VaultEnvelope } from '../crypto';

describe('createLocalVaultStore', () => {
  it('round-trips data', async () => {
    const store = createLocalVaultStore('u1', await generateDataKeyAsync());
    await store.save({ transactions: [{ id: 't1' }] });
    expect(await store.load()).toEqual({ transactions: [{ id: 't1' }] });
  });

  it('uses the same storage as secureStorage (no format change)', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('u1', dataKey, { rules: [1] });
    expect(await createLocalVaultStore('u1', dataKey).load()).toEqual({ rules: [1] });

    await createLocalVaultStore('u1', dataKey).save({ rules: [2] });
    expect(await loadVaultData('u1', dataKey)).toEqual({ rules: [2] });
  });

  it('returns {} for a user without a vault', async () => {
    expect(await createLocalVaultStore('nobody', await generateDataKeyAsync()).load()).toEqual({});
  });

  it('keeps users apart', async () => {
    const dataKey = await generateDataKeyAsync();
    await createLocalVaultStore('a', dataKey).save({ owner: 'a' });
    await createLocalVaultStore('b', dataKey).save({ owner: 'b' });
    expect(await createLocalVaultStore('a', dataKey).load()).toEqual({ owner: 'a' });
  });

  it('reads a vault written by the previous code', async () => {
    const { account } = legacyFixture;
    localStorage.setItem(`financaspro_${account.id}_vault`, legacyFixture.vaultCiphertext);
    const dataKey = await unlockVault(legacyFixture.password, account.envelope as VaultEnvelope);
    expect(await createLocalVaultStore(account.id, dataKey).load()).toEqual(legacyFixture.expectedVault);
  }, 30_000);
});
