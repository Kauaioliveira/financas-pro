import type { ExpenseBreakdownItem } from '../types';

/** Gastos de um mês já fechado, separados pela origem. */
export interface MonthSpend {
  month: string;
  /** Débito, PIX e transferências. */
  bank: number;
  /** Faturas que vencem no mês. */
  card: number;
}

export interface ProjectionPoint {
  month: string;
  /** Total previsto para o mês. */
  projected: number;
  low: number;
  high: number;
  /** Faturas já conhecidas para o mês (compras feitas que vencem nele). */
  knownCard: number;
}

export interface SpendingProjection {
  /** Quantos meses fechados entraram na conta. */
  basedOn: number;
  /** Média ponderada dos meses fechados (mais peso para os recentes). */
  average: number;
  /** Quanto o total tende a mudar por mês, já amortecido. */
  trendPerMonth: number;
  points: ProjectionPoint[];
}

export const MAX_HISTORY_MONTHS = 6;

export function addMonths(month: string, amount: number): string {
  const [year, monthValue] = month.split('-').map(Number);
  const date = new Date(year, monthValue - 1 + amount, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

export function weightedAverage(values: number[]): number {
  // Pesos 1, 2, 3...: o mês mais recente pesa mais.
  let sum = 0;
  let weights = 0;
  values.forEach((value, index) => {
    sum += value * (index + 1);
    weights += index + 1;
  });
  return weights > 0 ? sum / weights : 0;
}

function slope(values: number[]): number {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator > 0 ? numerator / denominator : 0;
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Projeta o total de gastos dos próximos meses.
 *
 * - Base: média ponderada dos até 6 meses fechados mais recentes.
 * - Tendência: inclinação da reta dos totais, pela metade e limitada a 10% da
 *   média por mês. Só entra com 3 meses ou mais; com menos, a projeção é plana.
 * - Piso: o gasto médio em conta mais as faturas que já existem para o mês.
 *   Uma compra parcelada já feita não some da projeção por estar acima da média.
 * - Faixa: um desvio-padrão dos totais para cada lado (15% da média enquanto
 *   houver só um mês), nunca abaixo do que já está comprometido no cartão.
 */
export function projectSpending(
  history: MonthSpend[],
  options: { startMonth: string; horizon: number; knownCardByMonth: (month: string) => number }
): SpendingProjection {
  const recent = history
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-MAX_HISTORY_MONTHS);

  if (!recent.length) {
    return { basedOn: 0, average: 0, trendPerMonth: 0, points: [] };
  }

  const totals = recent.map(item => item.bank + item.card);
  const average = weightedAverage(totals);
  const bankAverage = weightedAverage(recent.map(item => item.bank));
  const cap = average * 0.1;
  const trendPerMonth = recent.length >= 3 ? Math.max(-cap, Math.min(cap, slope(totals) / 2)) : 0;
  const spread = recent.length >= 2 ? standardDeviation(totals) : average * 0.15;

  const points: ProjectionPoint[] = [];
  for (let step = 0; step < options.horizon; step += 1) {
    const month = addMonths(options.startMonth, step);
    const knownCard = options.knownCardByMonth(month);
    const trendValue = Math.max(0, average + trendPerMonth * (step + 1));
    const projected = Math.max(trendValue, bankAverage + knownCard);
    points.push({
      month,
      projected,
      low: Math.max(knownCard, projected - spread, 0),
      high: projected + spread,
      knownCard,
    });
  }

  return { basedOn: recent.length, average, trendPerMonth, points };
}

export const OTHER_CATEGORY = 'Outros';

export interface CategoryHistory {
  /** Categorias em destaque, da maior para a menor, com "Outros" por último se existir. */
  keys: string[];
  rows: Array<{ month: string } & Record<string, number | string>>;
}

/**
 * Agrupa os gastos por categoria mês a mês. As `topN` maiores categorias da
 * janela inteira ficam separadas; o resto vai para "Outros". Assim a cor de
 * cada categoria é a mesma em todos os meses.
 */
export function buildCategoryHistory(
  months: string[],
  itemsByMonth: (month: string) => ExpenseBreakdownItem[],
  topN = 5
): CategoryHistory {
  const perMonth = months.map(month => ({ month, items: itemsByMonth(month) }));
  const totals = new Map<string, number>();
  for (const { items } of perMonth) {
    for (const item of items) {
      totals.set(item.label, (totals.get(item.label) || 0) + item.amount);
    }
  }

  const ranked = Array.from(totals.entries())
    .filter(([label, amount]) => label !== OTHER_CATEGORY && amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  const top = ranked.slice(0, topN);
  const topSet = new Set(top);
  const hasOther = ranked.length > topN || totals.has(OTHER_CATEGORY);
  const keys = hasOther ? [...top, OTHER_CATEGORY] : top;

  const rows = perMonth.map(({ month, items }) => {
    const row: { month: string } & Record<string, number | string> = { month };
    for (const key of keys) row[key] = 0;
    for (const item of items) {
      const key = topSet.has(item.label) ? item.label : OTHER_CATEGORY;
      if (key === OTHER_CATEGORY && !hasOther) continue;
      row[key] = (row[key] as number) + item.amount;
    }
    return row;
  });

  return { keys, rows };
}

/** Junta os itens de categoria de várias origens (conta e cartão) somando pelo nome. */
export function mergeCategoryItems(groups: ExpenseBreakdownItem[][]): ExpenseBreakdownItem[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const items of groups) {
    for (const item of items) {
      const current = map.get(item.label) || { amount: 0, count: 0 };
      current.amount += item.amount;
      current.count += item.count;
      map.set(item.label, current);
    }
  }
  const total = Array.from(map.values()).reduce((sum, item) => sum + item.amount, 0);
  return Array.from(map.entries())
    .map(([label, item]) => ({ label, ...item, share: total > 0 ? item.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}
