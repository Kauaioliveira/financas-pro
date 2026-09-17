import { describe, expect, it } from 'vitest';
import { mergeNotice, mergeVaults } from './mergeVault';
import type { VaultData } from '../vault';

type Records = Record<string, unknown>[] | undefined;

function vault(transactions: Records, extra: VaultData = {}): VaultData {
  return { transactions, ...extra };
}

const A = { id: 'a', description: 'Mercado', amount: -10 };
const A_EDITED_HERE = { ...A, description: 'Mercado do bairro' };
const A_EDITED_THERE = { ...A, description: 'Mercado da esquina' };
const B = { id: 'b', description: 'Uber', amount: -20 };

interface Case {
  name: string;
  base: Records;
  local: Records;
  remote: Records;
  expected: Records;
  conflicts: number;
}

const CASES: Case[] = [
  {
    name: 'not in the base and only this device has it: it enters',
    base: [A],
    local: [A, B],
    remote: [A],
    expected: [A, B],
    conflicts: 0,
  },
  {
    name: 'not in the base and only the other device has it: it enters',
    base: [A],
    local: [A],
    remote: [A, B],
    expected: [A, B],
    conflicts: 0,
  },
  {
    name: 'not in the base, both have it and they are equal: it enters once',
    base: [],
    local: [A],
    remote: [A],
    expected: [A],
    conflicts: 0,
  },
  {
    name: 'not in the base, both have it and they differ: the local one stays',
    base: [],
    local: [A_EDITED_HERE],
    remote: [A_EDITED_THERE],
    expected: [A_EDITED_HERE],
    conflicts: 1,
  },
  {
    name: 'deleted here, untouched there: it is deleted',
    base: [A, B],
    local: [B],
    remote: [A, B],
    expected: [B],
    conflicts: 0,
  },
  {
    name: 'deleted there, untouched here: it is deleted',
    base: [A, B],
    local: [A, B],
    remote: [B],
    expected: [B],
    conflicts: 0,
  },
  {
    name: 'deleted there, edited here: the edit stays',
    base: [A],
    local: [A_EDITED_HERE],
    remote: [],
    expected: [A_EDITED_HERE],
    conflicts: 1,
  },
  {
    name: 'deleted here, edited there: the edit stays',
    base: [A],
    local: [],
    remote: [A_EDITED_THERE],
    expected: [A_EDITED_THERE],
    conflicts: 1,
  },
  {
    name: 'edited on both sides: the local one stays',
    base: [A],
    local: [A_EDITED_HERE],
    remote: [A_EDITED_THERE],
    expected: [A_EDITED_HERE],
    conflicts: 1,
  },
  {
    name: 'edited on both sides in the same way: no conflict',
    base: [A],
    local: [A_EDITED_HERE],
    remote: [A_EDITED_HERE],
    expected: [A_EDITED_HERE],
    conflicts: 0,
  },
  {
    name: 'edited only there: the edit stays',
    base: [A],
    local: [A],
    remote: [A_EDITED_THERE],
    expected: [A_EDITED_THERE],
    conflicts: 0,
  },
  {
    name: 'deleted on both sides: it is deleted, without conflict',
    base: [A, B],
    local: [B],
    remote: [B],
    expected: [B],
    conflicts: 0,
  },
  {
    name: 'a missing collection counts as an empty list',
    base: undefined,
    local: [A],
    remote: undefined,
    expected: [A],
    conflicts: 0,
  },
  {
    name: 'key order inside a record is not an edit',
    base: [A],
    local: [{ amount: -10, description: 'Mercado', id: 'a' }],
    remote: [A],
    expected: [{ amount: -10, description: 'Mercado', id: 'a' }],
    conflicts: 0,
  },
];

describe('mergeVaults: rules, record by record', () => {
  it.each(CASES)('$name', ({ base, local, remote, expected, conflicts }) => {
    const merged = mergeVaults(vault(base), vault(local), vault(remote));
    expect(merged).not.toBeNull();
    expect(merged!.data.transactions).toEqual(expected);
    expect(merged!.conflicts).toBe(conflicts);
  });
});

describe('mergeVaults: every collection', () => {
  it('merges cards, card_purchases and rules by id too', () => {
    const base = { cards: [], card_purchases: [], rules: [{ id: 'r1', match: 'uber' }] };
    const local = {
      cards: [{ id: 'c1', name: 'Nubank' }],
      card_purchases: [],
      rules: [{ id: 'r1', match: 'uber', category: 'Transporte' }],
    };
    const remote = {
      cards: [],
      card_purchases: [{ id: 'p1', amount: -30 }],
      rules: [{ id: 'r1', match: 'uber' }],
    };

    const merged = mergeVaults(base, local, remote)!;
    expect(merged.data).toEqual({
      transactions: [],
      invoices: [],
      cards: [{ id: 'c1', name: 'Nubank' }],
      card_purchases: [{ id: 'p1', amount: -30 }],
      rules: [{ id: 'r1', match: 'uber', category: 'Transporte' }],
    });
    expect(merged.conflicts).toBe(0);
  });

  it('always answers with the five collections, even for an empty vault', () => {
    const merged = mergeVaults({}, {}, {})!;
    expect(merged.data).toEqual({ transactions: [], cards: [], card_purchases: [], invoices: [], rules: [] });
  });

  it('merges a key the app does not know yet, keeping the local side on a conflict', () => {
    const merged = mergeVaults({ settings: { theme: 'dark' } }, { settings: { theme: 'light' } }, { settings: { theme: 'system' } })!;
    expect(merged.data.settings).toEqual({ theme: 'light' });
    expect(merged.conflicts).toBe(1);
  });

  it('takes the value of the other device when only it changed a key the app does not know', () => {
    const merged = mergeVaults({ settings: { theme: 'dark' } }, { settings: { theme: 'dark' } }, { settings: { theme: 'system' } })!;
    expect(merged.data.settings).toEqual({ theme: 'system' });
    expect(merged.conflicts).toBe(0);
  });
});

describe('mergeVaults: invoices merge only the paid flag', () => {
  const invoice = { id: 'i1', cardId: 'c1', total: 100, paid: false, purchases: [{ id: 'p1' }] };

  it('takes "paid" from the device that changed it and keeps the rest local', () => {
    const local = { invoices: [{ ...invoice, total: 120 }] };
    const remote = { invoices: [{ ...invoice, paid: true }] };
    const merged = mergeVaults({ invoices: [invoice] }, local, remote)!;
    expect(merged.data.invoices).toEqual([{ ...invoice, total: 120, paid: true }]);
    expect(merged.conflicts).toBe(0);
  });

  it('ignores differences in the other fields, which come from the purchases', () => {
    const local = { invoices: [{ ...invoice, total: 120 }] };
    const remote = { invoices: [{ ...invoice, total: 90 }] };
    const merged = mergeVaults({ invoices: [invoice] }, local, remote)!;
    expect(merged.data.invoices).toEqual([{ ...invoice, total: 120 }]);
    expect(merged.conflicts).toBe(0);
  });

  it('keeps this device when both changed "paid" in different ways', () => {
    const local = { invoices: [{ ...invoice, paid: true }] };
    const remote = { invoices: [{ ...invoice, paid: 'sim' }] };
    const merged = mergeVaults({ invoices: [invoice] }, local, remote)!;
    expect(merged.data.invoices).toEqual([{ ...invoice, paid: true }]);
    expect(merged.conflicts).toBe(1);
  });

  it('keeps an invoice deleted on one side when the other marked it as paid', () => {
    const remote = { invoices: [{ ...invoice, paid: true }] };
    const merged = mergeVaults({ invoices: [invoice] }, { invoices: [] }, remote)!;
    expect(merged.data.invoices).toEqual([{ ...invoice, paid: true }]);
    expect(merged.conflicts).toBe(1);
  });

  it('deletes an invoice removed on one side when nobody changed "paid"', () => {
    const merged = mergeVaults({ invoices: [invoice] }, { invoices: [] }, { invoices: [invoice] })!;
    expect(merged.data.invoices).toEqual([]);
    expect(merged.conflicts).toBe(0);
  });

  it('a new invoice on one side enters', () => {
    const merged = mergeVaults({ invoices: [] }, { invoices: [] }, { invoices: [invoice] })!;
    expect(merged.data.invoices).toEqual([invoice]);
    expect(merged.conflicts).toBe(0);
  });
});

describe('mergeVaults: data it refuses to merge', () => {
  it.each([
    ['a collection that is not a list', { transactions: { id: 'a' } }],
    ['a record without an id', { transactions: [{ description: 'sem id' }] }],
    ['an id that is not text', { transactions: [{ id: 7 }] }],
    ['a repeated id', { transactions: [A, { id: 'a', description: 'outra' }] }],
    ['a list with something that is not a record', { transactions: ['a'] }],
  ])('returns null for %s', (_name, broken) => {
    expect(mergeVaults({ transactions: [] }, broken as VaultData, { transactions: [] })).toBeNull();
    expect(mergeVaults(broken as VaultData, { transactions: [] }, { transactions: [] })).toBeNull();
    expect(mergeVaults({ transactions: [] }, { transactions: [] }, broken as VaultData)).toBeNull();
  });
});

describe('mergeNotice', () => {
  it('counts the conflicts in Portuguese', () => {
    expect(mergeNotice(0)).toBe('Juntamos alterações de outro aparelho (0 conflitos; mantivemos as deste aparelho).');
    expect(mergeNotice(1)).toBe('Juntamos alterações de outro aparelho (1 conflito; mantivemos as deste aparelho).');
    expect(mergeNotice(3)).toBe('Juntamos alterações de outro aparelho (3 conflitos; mantivemos as deste aparelho).');
  });
});
