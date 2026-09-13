import { describe, expect, it } from 'vitest';
import { mergeImportedCardPurchases, mergeImportedTransactions } from './importMerge';
import type { CardPurchase, Transaction } from '../types';

let seq = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date: '2026-08-10',
    description: 'Cafe Central',
    amount: -8,
    type: 'debito',
    category: 'Alimentacao',
    bank: 'Neon',
    ...overrides,
  };
}

describe('mergeImportedTransactions', () => {
  it('keeps two identical purchases on the same day from a single file', () => {
    const result = mergeImportedTransactions([], [tx(), tx()]);
    expect(result.added).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('adds nothing when the same file is imported again', () => {
    const existing = [tx(), tx(), tx({ amount: -30, description: 'Uber' })];
    const reimport = existing.map(t => ({ ...t, id: `${t.id}-again` }));
    const result = mergeImportedTransactions(existing, reimport);
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
  });

  it('adds only the extra occurrence when statements overlap', () => {
    const existing = [tx()];
    const result = mergeImportedTransactions(existing, [tx(), tx()]);
    expect(result.added).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('treats the same purchase at a different bank as new', () => {
    const result = mergeImportedTransactions([tx()], [tx({ bank: 'Nubank' })]);
    expect(result.added).toHaveLength(1);
  });

  it('ignores case and whitespace differences in the description', () => {
    const result = mergeImportedTransactions(
      [tx({ description: 'Cafe Central' })],
      [tx({ description: '  CAFE   central ' })]
    );
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('skips a transaction whose id is already stored', () => {
    const stored = tx();
    const result = mergeImportedTransactions([stored], [{ ...stored, amount: -99 }]);
    expect(result.skipped).toHaveLength(1);
    expect(result.added).toHaveLength(0);
  });

  it('preserves the file order of added transactions', () => {
    const a = tx({ description: 'A' });
    const b = tx({ description: 'B' });
    const c = tx({ description: 'C' });
    const result = mergeImportedTransactions([b], [a, b, c]);
    expect(result.added.map(t => t.description)).toEqual(['A', 'C']);
  });
});

function purchase(overrides: Partial<CardPurchase> = {}): CardPurchase {
  seq += 1;
  return {
    id: `p${seq}`,
    cardId: 'card-1',
    cardName: 'Nubank Roxinho',
    bankName: 'Nubank',
    date: '2026-09-05',
    description: 'Padaria Estrela',
    amount: 12.5,
    category: 'Alimentacao',
    cycleMonth: '2026-09',
    paymentMonth: '2026-09',
    status: 'aberta',
    sourceFormat: 'csv',
    sourceName: 'fatura-setembro.csv',
    ...overrides,
  };
}

describe('mergeImportedCardPurchases', () => {
  it('adds every purchase of a first import', () => {
    const incoming = [purchase(), purchase({ description: 'Uber', amount: 23.9 })];
    const result = mergeImportedCardPurchases([], incoming);
    expect(result.added).toEqual(incoming);
    expect(result.skipped).toHaveLength(0);
  });

  it('keeps two identical purchases on the same day', () => {
    const result = mergeImportedCardPurchases([], [purchase(), purchase()]);
    expect(result.added).toHaveLength(2);
  });

  it('adds nothing when the same statement is imported again', () => {
    const existing = [purchase(), purchase(), purchase({ description: 'Uber', amount: 23.9 })];
    const reimport = existing.map(p => ({ ...p, id: `${p.id}-again` }));
    const result = mergeImportedCardPurchases(existing, reimport);
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
  });

  it('adds nothing when the same statement comes back under another file name or format', () => {
    const existing = [purchase()];
    const renamed = [purchase({ sourceName: 'fatura (1).pdf', sourceFormat: 'pdf' })];
    const result = mergeImportedCardPurchases(existing, renamed);
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('adds only the extra occurrence when a statement overlaps the stored one', () => {
    const result = mergeImportedCardPurchases([purchase()], [purchase(), purchase()]);
    expect(result.added).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('treats the same purchase on another card as new', () => {
    const result = mergeImportedCardPurchases([purchase()], [purchase({ cardId: 'card-2' })]);
    expect(result.added).toHaveLength(1);
  });
});
