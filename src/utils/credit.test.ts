import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCardPurchase,
  getCardCycleMonth,
  getInvoiceCloseDate,
  getInvoiceDueDate,
  getInvoicePaymentMonth,
  getInvoiceStatus,
} from './credit';
import type { CardAccount, CardPurchase } from '../types';

const CARD: CardAccount = {
  id: 'card-1',
  name: 'Cartao Teste',
  bankId: 'nubank',
  bankName: 'Nubank',
  supportedFormats: ['csv', 'pdf'],
  closingDay: 10,
  dueDay: 17,
  active: true,
  color: '#000',
  letter: 'C',
};

describe('getCardCycleMonth', () => {
  it('assigns a purchase on/before the closing day to the current month cycle', () => {
    expect(getCardCycleMonth('2026-07-10', 10)).toBe('2026-07');
    expect(getCardCycleMonth('2026-07-01', 10)).toBe('2026-07');
  });

  it('assigns a purchase after the closing day to the next month cycle', () => {
    expect(getCardCycleMonth('2026-07-11', 10)).toBe('2026-08');
  });

  it('rolls over the year when the cycle crosses December to January', () => {
    expect(getCardCycleMonth('2026-12-15', 10)).toBe('2027-01');
  });
});

describe('getInvoiceCloseDate', () => {
  it('clamps the closing day to the last day of a short month (February, non-leap year)', () => {
    // 2026 is not a leap year: Feb has 28 days.
    expect(getInvoiceCloseDate('2026-02', 31)).toBe('2026-02-28');
  });

  it('clamps the closing day to the last day of February in a leap year', () => {
    expect(getInvoiceCloseDate('2024-02', 31)).toBe('2024-02-29');
  });

  it('uses the closing day as-is when it fits in the month', () => {
    expect(getInvoiceCloseDate('2026-07', 10)).toBe('2026-07-10');
  });

  it('clamps a day below 1 up to 1', () => {
    expect(getInvoiceCloseDate('2026-07', 0)).toBe('2026-07-01');
  });
});

describe('getInvoiceDueDate', () => {
  it('uses the same month when the due day is after the closing day', () => {
    expect(getInvoiceDueDate('2026-07', 10, 17)).toBe('2026-07-17');
  });

  it('rolls over to the next month when the due day is on/before the closing day', () => {
    expect(getInvoiceDueDate('2026-07', 10, 5)).toBe('2026-08-05');
    expect(getInvoiceDueDate('2026-07', 10, 10)).toBe('2026-08-10');
  });

  it('rolls the year over when the next month crosses into January', () => {
    expect(getInvoiceDueDate('2026-12', 25, 5)).toBe('2027-01-05');
  });

  it('clamps the due day for short months after rollover', () => {
    // cycle Jan 2026, closingDay 5, dueDay 31 (> closingDay) -> due base stays January (31 days, no clamp needed)
    expect(getInvoiceDueDate('2026-01', 5, 31)).toBe('2026-01-31');
    // cycle Feb 2026, closingDay 5, dueDay 31 (> closingDay) -> due base stays February, clamps to 28
    expect(getInvoiceDueDate('2026-02', 5, 31)).toBe('2026-02-28');
  });
});

describe('getInvoicePaymentMonth', () => {
  it('returns the yyyy-MM slice of the due date', () => {
    expect(getInvoicePaymentMonth('2026-07', 10, 17)).toBe('2026-07');
    expect(getInvoicePaymentMonth('2026-07', 10, 5)).toBe('2026-08');
    expect(getInvoicePaymentMonth('2026-12', 25, 5)).toBe('2027-01');
  });
});

describe('getInvoiceStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "paga" whenever paid is true, regardless of dates', () => {
    vi.setSystemTime(new Date('2020-01-01T00:00:00'));
    expect(getInvoiceStatus({ paid: true, closeDate: '2099-12-31' })).toBe('paga');
  });

  it('returns "aberta" on the close date itself (not strictly after)', () => {
    vi.setSystemTime(new Date('2026-07-14T00:00:00'));
    expect(getInvoiceStatus({ paid: false, closeDate: '2026-07-14' })).toBe('aberta');
  });

  it('returns "aberta" before the close date', () => {
    vi.setSystemTime(new Date('2026-07-10T00:00:00'));
    expect(getInvoiceStatus({ paid: false, closeDate: '2026-07-14' })).toBe('aberta');
  });

  it('returns "fechada" after the close date', () => {
    vi.setSystemTime(new Date('2026-07-15T00:00:00'));
    expect(getInvoiceStatus({ paid: false, closeDate: '2026-07-14' })).toBe('fechada');
  });
});

describe('buildCardPurchase', () => {
  const rawPurchase: Omit<CardPurchase, 'cycleMonth' | 'paymentMonth' | 'status'> = {
    id: 'p1',
    cardId: CARD.id,
    cardName: CARD.name,
    bankName: CARD.bankName,
    date: '2026-07-15',
    description: 'Loja Teste',
    amount: 100,
    category: 'Outros',
    sourceFormat: 'csv',
    sourceName: 'extrato.csv',
  };

  it('computes cycleMonth and paymentMonth from the card cycle rules', () => {
    const purchase = buildCardPurchase(rawPurchase, CARD);
    expect(purchase.cycleMonth).toBe('2026-08'); // day 15 > closingDay 10 -> next cycle
    expect(purchase.paymentMonth).toBe('2026-08'); // dueDay 17 > closingDay 10 -> same month as cycle
  });

  it('always defaults status to "aberta" regardless of dates', () => {
    const purchase = buildCardPurchase(rawPurchase, CARD);
    expect(purchase.status).toBe('aberta');

    const oldPurchase = buildCardPurchase({ ...rawPurchase, date: '2000-01-01' }, CARD);
    expect(oldPurchase.status).toBe('aberta');
  });

  it('preserves all raw purchase fields', () => {
    const purchase = buildCardPurchase(rawPurchase, CARD);
    expect(purchase.id).toBe('p1');
    expect(purchase.description).toBe('Loja Teste');
    expect(purchase.amount).toBe(100);
  });
});
