import { describe, expect, it } from 'vitest';
import {
  addMonths,
  buildCategoryHistory,
  mergeCategoryItems,
  OTHER_CATEGORY,
  projectSpending,
} from './projection';
import type { MonthSpend } from './projection';
import type { ExpenseBreakdownItem } from '../types';

const noCard = () => 0;

function item(label: string, amount: number, count = 1): ExpenseBreakdownItem {
  return { label, amount, count, share: 0 };
}

describe('addMonths', () => {
  it('crosses the year in both directions', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('projectSpending', () => {
  it('returns no points without closed months', () => {
    const result = projectSpending([], { startMonth: '2026-09', horizon: 3, knownCardByMonth: noCard });
    expect(result.points).toEqual([]);
    expect(result.basedOn).toBe(0);
  });

  it('is flat and uses a 15% band with a single month', () => {
    const result = projectSpending([{ month: '2026-08', bank: 1000, card: 0 }], {
      startMonth: '2026-09',
      horizon: 2,
      knownCardByMonth: noCard,
    });
    expect(result.trendPerMonth).toBe(0);
    expect(result.points.map(point => point.projected)).toEqual([1000, 1000]);
    expect(result.points[0].low).toBeCloseTo(850);
    expect(result.points[0].high).toBeCloseTo(1150);
    expect(result.points.map(point => point.month)).toEqual(['2026-09', '2026-10']);
  });

  it('weights recent months more than old ones', () => {
    const history: MonthSpend[] = [
      { month: '2026-06', bank: 1000, card: 0 },
      { month: '2026-07', bank: 2000, card: 0 },
    ];
    const result = projectSpending(history, { startMonth: '2026-08', horizon: 1, knownCardByMonth: noCard });
    // (1000*1 + 2000*2) / 3
    expect(result.average).toBeCloseTo(5000 / 3);
  });

  it('keeps only the 6 most recent months, whatever the input order', () => {
    const history: MonthSpend[] = [
      { month: '2026-08', bank: 100, card: 0 },
      { month: '2025-01', bank: 100000, card: 0 },
      ...['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map(month => ({ month, bank: 100, card: 0 })),
    ];
    const result = projectSpending(history, { startMonth: '2026-09', horizon: 1, knownCardByMonth: noCard });
    expect(result.basedOn).toBe(6);
    expect(result.average).toBeCloseTo(100);
  });

  it('caps the trend at 10% of the average per month', () => {
    const history: MonthSpend[] = [
      { month: '2026-05', bank: 100, card: 0 },
      { month: '2026-06', bank: 1000, card: 0 },
      { month: '2026-07', bank: 5000, card: 0 },
    ];
    const result = projectSpending(history, { startMonth: '2026-08', horizon: 1, knownCardByMonth: noCard });
    expect(result.trendPerMonth).toBeCloseTo(result.average * 0.1);
  });

  it('never projects less than the bank average plus invoices already known', () => {
    const history: MonthSpend[] = [
      { month: '2026-06', bank: 500, card: 500 },
      { month: '2026-07', bank: 500, card: 500 },
      { month: '2026-08', bank: 500, card: 500 },
    ];
    const known: Record<string, number> = { '2026-10': 3000 };
    const result = projectSpending(history, {
      startMonth: '2026-09',
      horizon: 2,
      knownCardByMonth: month => known[month] || 0,
    });
    expect(result.points[0].projected).toBeCloseTo(1000);
    expect(result.points[1].projected).toBeCloseTo(3500);
    expect(result.points[1].knownCard).toBe(3000);
    expect(result.points[1].low).toBeGreaterThanOrEqual(3000);
  });
});

describe('buildCategoryHistory', () => {
  const data: Record<string, ExpenseBreakdownItem[]> = {
    '2026-07': [item('Mercado', 800), item('Transporte', 200), item('Lazer', 50)],
    '2026-08': [item('Mercado', 700), item('Saude', 300), item(OTHER_CATEGORY, 10)],
  };

  it('keeps the top categories of the whole window and folds the rest into Outros', () => {
    const result = buildCategoryHistory(['2026-07', '2026-08'], month => data[month], 2);
    expect(result.keys).toEqual(['Mercado', 'Saude', OTHER_CATEGORY]);
    expect(result.rows[0]).toEqual({ month: '2026-07', Mercado: 800, Saude: 0, [OTHER_CATEGORY]: 250 });
    expect(result.rows[1]).toEqual({ month: '2026-08', Mercado: 700, Saude: 300, [OTHER_CATEGORY]: 10 });
  });

  it('has no Outros key when every category fits', () => {
    const result = buildCategoryHistory(['2026-07'], () => [item('Mercado', 10)], 5);
    expect(result.keys).toEqual(['Mercado']);
  });
});

describe('mergeCategoryItems', () => {
  it('sums the same category from bank and card and recomputes the share', () => {
    const merged = mergeCategoryItems([[item('Mercado', 100, 2)], [item('Mercado', 100, 1), item('Lazer', 200)]]);
    expect(merged).toEqual([
      { label: 'Lazer', amount: 200, count: 1, share: 0.5 },
      { label: 'Mercado', amount: 200, count: 3, share: 0.5 },
    ]);
  });
});
