import { beforeEach, describe, expect, it } from 'vitest';
import { encryptData, generateDataKeyAsync } from '../lib/crypto/crypto';
import {
  clearLegacyData,
  deleteVaultData,
  hasLegacyData,
  loadVaultData,
  readLegacyData,
  saveVaultData,
  LEGACY_KEYS,
} from './secureStorage';

describe('loadVaultData / saveVaultData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips data through a real generated data key', async () => {
    const dataKey = await generateDataKeyAsync();
    const payload = { transactions: [{ id: 't1', amount: -10 }], version: 3 };

    await saveVaultData('user-1', dataKey, payload);
    const loaded = await loadVaultData('user-1', dataKey);

    expect(loaded).toEqual(payload);
  });

  it('returns an empty object when there is no vault stored for the user', async () => {
    const dataKey = await generateDataKeyAsync();
    expect(await loadVaultData('nonexistent-user', dataKey)).toEqual({});
  });

  it('returns an empty object when the stored ciphertext is corrupt', async () => {
    const dataKey = await generateDataKeyAsync();
    localStorage.setItem('financaspro_user-1_vault', 'not valid encrypted payload json');
    expect(await loadVaultData('user-1', dataKey)).toEqual({});
  });

  it('returns an empty object when decryption fails (wrong key)', async () => {
    const dataKey = await generateDataKeyAsync();
    const wrongKey = await generateDataKeyAsync();
    await saveVaultData('user-1', dataKey, { secret: true });
    expect(await loadVaultData('user-1', wrongKey)).toEqual({});
  });

  it('returns an empty object when the decrypted JSON is a primitive (number/string/null)', async () => {
    const dataKey = await generateDataKeyAsync();
    // saveVaultData always JSON.stringifies an object, so we bypass it here by
    // encrypting a non-object payload directly through the same encryption used internally.
    for (const primitiveJson of ['42', '"a string"', 'null']) {
      const encrypted = await encryptData(dataKey, primitiveJson);
      localStorage.setItem('financaspro_user-1_vault', encrypted);
      expect(await loadVaultData('user-1', dataKey)).toEqual({});
    }
  });

  it('passes an array through unchanged, since the guard only checks typeof === "object" (arrays qualify)', async () => {
    const dataKey = await generateDataKeyAsync();
    const encrypted = await encryptData(dataKey, JSON.stringify([1, 2, 3]));
    localStorage.setItem('financaspro_user-1_vault', encrypted);

    // This documents actual behavior: `typeof [] === 'object'` so the defensive
    // check `typeof parsed === 'object' && parsed !== null` does not catch arrays.
    expect(await loadVaultData('user-1', dataKey)).toEqual([1, 2, 3]);
  });

  it('scopes vault storage per user id', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('user-a', dataKey, { who: 'a' });
    await saveVaultData('user-b', dataKey, { who: 'b' });

    expect(await loadVaultData('user-a', dataKey)).toEqual({ who: 'a' });
    expect(await loadVaultData('user-b', dataKey)).toEqual({ who: 'b' });
  });
});

describe('deleteVaultData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes the vault entry for the given user', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('user-1', dataKey, { a: 1 });
    deleteVaultData('user-1');
    expect(await loadVaultData('user-1', dataKey)).toEqual({});
  });
});

describe('legacy data helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hasLegacyData is false when nothing is stored', () => {
    expect(hasLegacyData()).toBe(false);
  });

  it('hasLegacyData is false when legacy keys are only empty arrays', () => {
    for (const key of LEGACY_KEYS) localStorage.setItem(key, '[]');
    expect(hasLegacyData()).toBe(false);
  });

  it('hasLegacyData is true when a legacy key has real content', () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify([{ id: 't1' }]));
    expect(hasLegacyData()).toBe(true);
  });

  it('readLegacyData strips the key prefix and parses each value', () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify([{ id: 't1' }]));
    localStorage.setItem('financaspro_cards', JSON.stringify([{ id: 'c1' }]));

    const data = readLegacyData();
    expect(data.transactions).toEqual([{ id: 't1' }]);
    expect(data.cards).toEqual([{ id: 'c1' }]);
  });

  it('readLegacyData skips corrupt entries instead of throwing', () => {
    localStorage.setItem('financaspro_transactions', '{not valid json');
    const data = readLegacyData();
    expect(data.transactions).toBeUndefined();
  });

  it('clearLegacyData removes all legacy keys and the user name key', () => {
    for (const key of LEGACY_KEYS) localStorage.setItem(key, JSON.stringify([1]));
    localStorage.setItem('financaspro_user_name', 'Fulano');

    clearLegacyData();

    for (const key of LEGACY_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('financaspro_user_name')).toBeNull();
  });
});
