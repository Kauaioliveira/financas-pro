import type { CategoryBudget, ExpenseBreakdownItem } from '../types';
import { MAX_HISTORY_MONTHS, weightedAverage } from './projection';

/** A partir desta fração do teto a categoria fica em atenção. */
export const BUDGET_WARNING_RATIO = 0.8;

export type BudgetStatus = 'ok' | 'atencao' | 'estourou';

/**
 * Id estável derivado da categoria: dois aparelhos que definem o teto da mesma
 * categoria editam o mesmo registro, e a sincronização junta sem duplicar.
 */
export function budgetId(category: string): string {
  return `budget:${category.trim().toLocaleLowerCase('pt-BR')}`;
}

export function budgetStatus(spent: number, limit: number): BudgetStatus {
  if (limit <= 0) return 'ok';
  const ratio = spent / limit;
  if (ratio >= 1) return 'estourou';
  if (ratio >= BUDGET_WARNING_RATIO) return 'atencao';
  return 'ok';
}

/** Arredonda a sugestão para cima, em múltiplos de R$ 10. */
function roundUp(value: number): number {
  return Math.ceil(value / 10) * 10;
}

export interface BudgetSuggestion {
  category: string;
  suggested: number;
}

/**
 * Teto sugerido por categoria: média ponderada dos até 6 meses fechados mais
 * recentes (o mais novo pesa mais), contando como zero o mês em que a categoria
 * não teve gasto. Uma compra isolada num mês só vira uma sugestão pequena.
 */
export function suggestBudgets(
  closedMonths: string[],
  itemsByMonth: (month: string) => ExpenseBreakdownItem[]
): BudgetSuggestion[] {
  const months = closedMonths.slice().sort().slice(-MAX_HISTORY_MONTHS);
  const perMonth = months.map(month => new Map(itemsByMonth(month).map(item => [item.label, item.amount])));
  const categories = new Set(perMonth.flatMap(map => Array.from(map.keys())));

  return Array.from(categories)
    .map(category => ({
      category,
      suggested: roundUp(weightedAverage(perMonth.map(map => map.get(category) || 0))),
    }))
    .filter(item => item.suggested > 0)
    .sort((a, b) => b.suggested - a.suggested || a.category.localeCompare(b.category));
}

export interface BudgetRow {
  category: string;
  limit: number;
  spent: number;
  /** Gasto dividido pelo teto (1 = teto inteiro usado). */
  ratio: number;
  status: BudgetStatus;
}

export interface BudgetReport {
  rows: BudgetRow[];
  /** Categorias com gasto no mês e sem teto definido. */
  unbudgeted: ExpenseBreakdownItem[];
  totalLimit: number;
  /** Gasto só nas categorias com teto. */
  totalBudgetedSpent: number;
  /** Gasto do mês inteiro, com e sem teto. */
  totalSpent: number;
}

export function buildBudgetReport(budgets: CategoryBudget[], items: ExpenseBreakdownItem[]): BudgetReport {
  const spentById = new Map<string, number>();
  for (const item of items) {
    const id = budgetId(item.label);
    spentById.set(id, (spentById.get(id) || 0) + item.amount);
  }
  const budgetIds = new Set(budgets.map(budget => budget.id));

  const rows = budgets
    .map(budget => {
      const spent = spentById.get(budget.id) || 0;
      return {
        category: budget.category,
        limit: budget.limit,
        spent,
        ratio: budget.limit > 0 ? spent / budget.limit : 0,
        status: budgetStatus(spent, budget.limit),
      };
    })
    .sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));

  return {
    rows,
    unbudgeted: items.filter(item => item.amount > 0 && !budgetIds.has(budgetId(item.label))),
    totalLimit: rows.reduce((sum, row) => sum + row.limit, 0),
    totalBudgetedSpent: rows.reduce((sum, row) => sum + row.spent, 0),
    totalSpent: items.reduce((sum, item) => sum + item.amount, 0),
  };
}
