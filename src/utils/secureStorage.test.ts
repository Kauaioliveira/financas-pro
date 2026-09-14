import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptData, generateDataKeyAsync } from '../lib/crypto/crypto';
import {
  clearLegacyData,
  deleteVaultData,
  hasLegacyData,
  loadVaultData,
  readLegacyData,
  saveVaultData,
  LEGACY_KEYS,
  VaultLoadError,
  VaultSaveError,
  listUnreadableVaultCopies,
  preserveUnreadableVault,
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

  it('throws VaultLoadError (not {}) when the stored ciphertext is corrupt', async () => {
    const dataKey = await generateDataKeyAsync();
    localStorage.setItem('financaspro_user-1_vault', 'not valid encrypted payload json');
    await expect(loadVaultData('user-1', dataKey)).rejects.toMatchObject({
      name: 'VaultLoadError',
      reason: 'decrypt',
    });
  });

  it('throws VaultLoadError when decryption fails (wrong key) and leaves the vault intact', async () => {
    const dataKey = await generateDataKeyAsync();
    const wrongKey = await generateDataKeyAsync();
    await saveVaultData('user-1', dataKey, { secret: true });
    const before = localStorage.getItem('financaspro_user-1_vault');

    await expect(loadVaultData('user-1', wrongKey)).rejects.toBeInstanceOf(VaultLoadError);
    expect(localStorage.getItem('financaspro_user-1_vault')).toBe(before);
    expect(await loadVaultData('user-1', dataKey)).toEqual({ secret: true });
  });

  it('throws when the decrypted content is not JSON', async () => {
    const dataKey = await generateDataKeyAsync();
    localStorage.setItem('financaspro_user-1_vault', await encryptData(dataKey, '{not json'));
    await expect(loadVaultData('user-1', dataKey)).rejects.toMatchObject({ reason: 'invalid-json' });
  });

  it('throws when the decrypted JSON is not an object (primitive, null or array)', async () => {
    const dataKey = await generateDataKeyAsync();
    for (const json of ['42', '"a string"', 'null', '[1,2,3]']) {
      localStorage.setItem('financaspro_user-1_vault', await encryptData(dataKey, json));
      await expect(loadVaultData('user-1', dataKey)).rejects.toMatchObject({ reason: 'invalid-shape' });
    }
  });

  it('throws VaultLoadError when storage cannot be read', async () => {
    const dataKey = await generateDataKeyAsync();
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    try {
      await expect(loadVaultData('user-1', dataKey)).rejects.toMatchObject({ reason: 'read' });
    } finally {
      spy.mockRestore();
    }
  });

  it('scopes vault storage per user id', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('user-a', dataKey, { who: 'a' });
    await saveVaultData('user-b', dataKey, { who: 'b' });

    expect(await loadVaultData('user-a', dataKey)).toEqual({ who: 'a' });
    expect(await loadVaultData('user-b', dataKey)).toEqual({ who: 'b' });
  });
});

describe('saveVaultData errors', () => {
  it('propagates a full storage as a quota VaultSaveError and keeps the previous vault', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('user-1', dataKey, { version: 1 });
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      const error = await saveVaultData('user-1', dataKey, { version: 2 }).catch(e => e);
      expect(error).toBeInstanceOf(VaultSaveError);
      expect(error.reason).toBe('quota');
      expect(error.message).toMatch(/exporte um backup/i);
    } finally {
      spy.mockRestore();
    }
    expect(await loadVaultData('user-1', dataKey)).toEqual({ version: 1 });
  });

  it('propagates other write errors as write VaultSaveError', async () => {
    const dataKey = await generateDataKeyAsync();
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      await expect(saveVaultData('user-1', dataKey, {})).rejects.toMatchObject({ reason: 'write' });
    } finally {
      spy.mockRestore();
    }
  });

  it('does not write when beforeWrite throws', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('user-1', dataKey, { version: 1 });
    await expect(
      saveVaultData('user-1', dataKey, { version: 2 }, {
        beforeWrite: () => {
          throw new VaultSaveError('stale-key', 'stale');
        },
      }),
    ).rejects.toMatchObject({ reason: 'stale-key' });
    expect(await loadVaultData('user-1', dataKey)).toEqual({ version: 1 });
  });
});

describe('preserveUnreadableVault', () => {
  it('copies the raw vault to a side key', () => {
    localStorage.setItem('financaspro_user-1_vault', 'raw-ciphertext');
    const key = preserveUnreadableVault('user-1', new Date(1_700_000_000_000));
    expect(key).toBe('financaspro_user-1_vault_unreadable_1700000000000');
    expect(localStorage.getItem(key!)).toBe('raw-ciphertext');
    expect(listUnreadableVaultCopies('user-1')).toEqual([key]);
  });

  it('returns null when there is no vault (edge)', () => {
    expect(preserveUnreadableVault('user-1')).toBeNull();
  });

  it('throws and changes nothing when the copy cannot be written', () => {
    localStorage.setItem('financaspro_user-1_vault', 'raw-ciphertext');
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      expect(() => preserveUnreadableVault('user-1')).toThrow(/nada foi alterado/i);
    } finally {
      spy.mockRestore();
    }
    expect(localStorage.getItem('financaspro_user-1_vault')).toBe('raw-ciphertext');
    expect(listUnreadableVaultCopies('user-1')).toEqual([]);
  });
});

describe('deleteVaultData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes the vault entry for the given user', async () => {
    const dataKey = await generateDataKeyAsync();
    await saveVaultData('user-1', dataKey, { a: 1 });
    preserveUnreadableVault('user-1');
    deleteVaultData('user-1');
    expect(await loadVaultData('user-1', dataKey)).toEqual({});
    expect(listUnreadableVaultCopies('user-1')).toEqual([]);
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
