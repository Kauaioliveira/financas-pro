import { describe, expect, it } from 'vitest';
import { migrateLegacyData } from './migrateLegacy';
import { createLocalVaultStore } from './localVaultStore';
import { generateDataKeyAsync } from '../crypto';
import { VaultSaveError } from '../../utils/secureStorage';
import type { VaultStore } from './types';

describe('migrateLegacyData', () => {
  it('encrypts the plaintext, verifies it and only then removes it', async () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify([{ id: 't1' }]));
    localStorage.setItem('financaspro_rules', JSON.stringify([{ id: 'r1' }]));
    localStorage.setItem('financaspro_user_name', 'Fulano');
    const store = createLocalVaultStore('u1', await generateDataKeyAsync());

    const result = await migrateLegacyData(store);

    expect(result).toEqual({ migrated: ['financaspro_transactions', 'financaspro_rules'], kept: [] });
    expect(await store.load()).toEqual({ transactions: [{ id: 't1' }], rules: [{ id: 'r1' }] });
    expect(localStorage.getItem('financaspro_transactions')).toBeNull();
    expect(localStorage.getItem('financaspro_user_name')).toBeNull();
  });

  it('keeps corrupt legacy keys untouched (edge)', async () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify([{ id: 't1' }]));
    localStorage.setItem('financaspro_cards', '{corrupt');
    const store = createLocalVaultStore('u1', await generateDataKeyAsync());

    const result = await migrateLegacyData(store);

    expect(result.kept).toEqual(['financaspro_cards']);
    expect(localStorage.getItem('financaspro_cards')).toBe('{corrupt');
    expect(localStorage.getItem('financaspro_transactions')).toBeNull();
  });

  it('does not delete the plaintext when the encrypted write fails', async () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify([{ id: 't1' }]));
    const store: VaultStore = {
      load: async () => ({}),
      save: async () => {
        throw new VaultSaveError('quota', 'cheio');
      },
      preserveUnreadable: async () => {},
    };
    await expect(migrateLegacyData(store)).rejects.toMatchObject({ reason: 'quota' });
    expect(localStorage.getItem('financaspro_transactions')).toBe(JSON.stringify([{ id: 't1' }]));
  });

  it('does not delete the plaintext when the read-back differs', async () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify([{ id: 't1' }]));
    const store: VaultStore = {
      load: async () => ({ transactions: [] }),
      save: async () => {},
      preserveUnreadable: async () => {},
    };
    await expect(migrateLegacyData(store)).rejects.toThrow(/não foram apagados/);
    expect(localStorage.getItem('financaspro_transactions')).not.toBeNull();
  });
});
