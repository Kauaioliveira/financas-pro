import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredFinanceData,
  exportData,
  importData,
  loadCardPurchases,
  loadCards,
  loadInvoices,
  loadRules,
  loadTransactions,
  saveCardPurchases,
  saveCards,
  saveInvoices,
  saveRules,
  saveTransactions,
} from './storage';
import type {
  CardAccount,
  CardInvoice,
  CardPurchase,
  CategoryRule,
  Transaction,
} from '../types';

const TX: Transaction = {
  id: 't1',
  date: '2026-07-01',
  description: 'Mercado',
  amount: -50,
  type: 'debito',
  category: 'Alimentacao',
  bank: 'Nubank',
};

const CARD: CardAccount = {
  id: 'c1',
  name: 'Cartao',
  bankId: 'nubank',
  bankName: 'Nubank',
  supportedFormats: ['csv'],
  closingDay: 10,
  dueDay: 17,
  active: true,
  color: '#000',
  letter: 'C',
};

const PURCHASE: CardPurchase = {
  id: 'p1',
  cardId: 'c1',
  cardName: 'Cartao',
  bankName: 'Nubank',
  date: '2026-07-05',
  description: 'Compra',
  amount: 20,
  category: 'Outros',
  cycleMonth: '2026-07',
  paymentMonth: '2026-08',
  status: 'aberta',
  sourceFormat: 'csv',
  sourceName: 'extrato.csv',
};

const INVOICE: CardInvoice = {
  id: 'i1',
  cardId: 'c1',
  cardName: 'Cartao',
  bankName: 'Nubank',
  cycleMonth: '2026-07',
  paymentMonth: '2026-08',
  closeDate: '2026-07-10',
  dueDate: '2026-08-17',
  purchases: [PURCHASE],
  total: 20,
  paid: false,
  status: 'aberta',
};

const RULE: CategoryRule = {
  id: 'r1',
  matchText: 'ifood',
  category: 'Alimentacao',
  enabled: true,
};

describe('storage round-trips', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips transactions', () => {
    expect(loadTransactions()).toEqual([]);
    saveTransactions([TX]);
    expect(loadTransactions()).toEqual([TX]);
  });

  it('round-trips cards', () => {
    saveCards([CARD]);
    expect(loadCards()).toEqual([CARD]);
  });

  it('round-trips card purchases', () => {
    saveCardPurchases([PURCHASE]);
    expect(loadCardPurchases()).toEqual([PURCHASE]);
  });

  it('round-trips invoices', () => {
    saveInvoices([INVOICE]);
    expect(loadInvoices()).toEqual([INVOICE]);
  });

  it('round-trips rules', () => {
    saveRules([RULE]);
    expect(loadRules()).toEqual([RULE]);
  });
});

describe('defensive reads', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty array when the key is missing', () => {
    expect(loadTransactions()).toEqual([]);
  });

  it('returns an empty array for corrupt JSON', () => {
    localStorage.setItem('financaspro_transactions', '{not valid json');
    expect(loadTransactions()).toEqual([]);
  });

  it('returns an empty array when the stored JSON is not an array', () => {
    localStorage.setItem('financaspro_transactions', JSON.stringify({ foo: 'bar' }));
    expect(loadTransactions()).toEqual([]);
  });

  it('returns an empty array when the stored JSON is null', () => {
    localStorage.setItem('financaspro_transactions', 'null');
    expect(loadTransactions()).toEqual([]);
  });
});

describe('clearStoredFinanceData', () => {
  it('removes all finance data keys', () => {
    saveTransactions([TX]);
    saveCards([CARD]);
    saveCardPurchases([PURCHASE]);
    saveInvoices([INVOICE]);
    saveRules([RULE]);

    clearStoredFinanceData();

    expect(loadTransactions()).toEqual([]);
    expect(loadCards()).toEqual([]);
    expect(loadCardPurchases()).toEqual([]);
    expect(loadInvoices()).toEqual([]);
    expect(loadRules()).toEqual([]);
  });
});

describe('exportData / importData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips all finance data through export/import', () => {
    saveTransactions([TX]);
    saveCards([CARD]);
    saveCardPurchases([PURCHASE]);
    saveInvoices([INVOICE]);
    saveRules([RULE]);

    const exported = exportData();
    const parsed = JSON.parse(exported);
    expect(parsed.exportDate).toBeDefined();

    const imported = importData(exported);
    expect(imported.transactions).toEqual([TX]);
    expect(imported.cards).toEqual([CARD]);
    expect(imported.cardPurchases).toEqual([PURCHASE]);
    expect(imported.invoices).toEqual([INVOICE]);
    expect(imported.rules).toEqual([RULE]);
  });

  it('defaults missing/non-array fields to empty arrays on import', () => {
    const imported = importData(JSON.stringify({ transactions: 'not-an-array' }));
    expect(imported.transactions).toEqual([]);
    expect(imported.cards).toEqual([]);
    expect(imported.cardPurchases).toEqual([]);
    expect(imported.invoices).toEqual([]);
    expect(imported.rules).toEqual([]);
  });

  it('throws on malformed JSON input', () => {
    expect(() => importData('{not valid')).toThrow();
  });
});
