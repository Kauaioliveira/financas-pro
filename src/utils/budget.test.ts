import { describe, expect, it } from 'vitest';
import { budgetId, budgetStatus, buildBudgetReport, suggestBudgets } from './budget';
import type { CategoryBudget, ExpenseBreakdownItem } from '../types';

function item(label: string, amount: number): ExpenseBreakdownItem {
  return { label, amount, count: 1, share: 0 };
}

function budget(category: string, limit: number): CategoryBudget {
  return { id: budgetId(category), category, limit };
}

describe('budgetId', () => {
  it('ignores case and surrounding spaces, keeps accents', () => {
    expect(budgetId(' Mercado ')).toBe(budgetId('mercado'));
    expect(budgetId('Alimentação')).not.toBe(budgetId('Alimentacao'));
  });
});

describe('budgetStatus', () => {
  it('warns from 80% and overflows from 100%', () => {
    expect(budgetStatus(79, 100)).toBe('ok');
    expect(budgetStatus(80, 100)).toBe('atencao');
    expect(budgetStatus(100, 100)).toBe('estourou');
    expect(budgetStatus(150, 100)).toBe('estourou');
  });
});

describe('suggestBudgets', () => {
  const data: Record<string, ExpenseBreakdownItem[]> = {
    '2026-07': [item('Mercado', 900), item('Viagem', 3000)],
    '2026-08': [item('Mercado', 1200)],
  };

  it('uses a weighted average, counts missing months as zero and rounds up to R$ 10', () => {
    const result = suggestBudgets(['2026-08', '2026-07'], month => data[month]);
    // Mercado: (900*1 + 1200*2) / 3 = 1100; Viagem: 3000*1 / 3 = 1000
    expect(result).toEqual([
      { category: 'Mercado', suggested: 1100 },
      { category: 'Viagem', suggested: 1000 },
    ]);
  });

  it('rounds fractional averages up', () => {
    const result = suggestBudgets(['2026-08'], () => [item('Lazer', 101.5)]);
    expect(result).toEqual([{ category: 'Lazer', suggested: 110 }]);
  });

  it('returns nothing without closed months', () => {
    expect(suggestBudgets([], () => [])).toEqual([]);
  });
});

describe('buildBudgetReport', () => {
  it('matches spending to budgets, sorts by usage and lists what has no budget', () => {
    const report = buildBudgetReport(
      [budget('Mercado', 1000), budget('Lazer', 200), budget('Saude', 300)],
      [item('mercado', 850), item('Lazer', 260), item('Transporte', 120)]
    );
    expect(report.rows.map(row => [row.category, row.spent, row.status])).toEqual([
      ['Lazer', 260, 'estourou'],
      ['Mercado', 850, 'atencao'],
      ['Saude', 0, 'ok'],
    ]);
    expect(report.unbudgeted.map(entry => entry.label)).toEqual(['Transporte']);
    expect(report.totalLimit).toBe(1500);
    expect(report.totalBudgetedSpent).toBe(1110);
    expect(report.totalSpent).toBe(1230);
  });
});
