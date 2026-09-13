import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  FolderClock,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  Wand2,
  BarChart3,
  Wallet,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/useFinance';
import type { ExpenseBreakdown, ExpenseBreakdownItem } from '../types';
import { formatCurrency, formatDate, getMonthLabel } from '../utils/parser';

const axisStyle = { fontSize: 12, fill: '#94a3b8' } as const;
const tooltipStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(6, 10, 19, 0.94)',
  boxShadow: '0 22px 50px rgba(0,0,0,0.35)',
  padding: '12px 14px',
} as const;

type DashboardFilter = 'all' | 'bank' | 'card' | 'consolidated';

function normalizeItems(items: ExpenseBreakdownItem[]): ExpenseBreakdownItem[] {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return items
    .map(item => ({
      ...item,
      share: total > 0 ? item.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

function mergeItems(groups: ExpenseBreakdownItem[][]): ExpenseBreakdownItem[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const items of groups) {
    for (const item of items) {
      const current = map.get(item.label) || { amount: 0, count: 0 };
      current.amount += item.amount;
      current.count += item.count;
      map.set(item.label, current);
    }
  }

  return normalizeItems(
    Array.from(map.entries()).map(([label, item]) => ({
      label,
      amount: item.amount,
      count: item.count,
      share: 0,
    }))
  );
}

function mergeBreakdowns(breakdowns: ExpenseBreakdown[]): ExpenseBreakdown {
  const total = breakdowns.reduce((sum, breakdown) => sum + breakdown.total, 0);
  const byCategory = mergeItems(breakdowns.map(breakdown => breakdown.byCategory));
  const byType = mergeItems(breakdowns.map(breakdown => breakdown.byType));
  const topMerchants = mergeItems(breakdowns.map(breakdown => breakdown.topMerchants)).slice(0, 3);

  return {
    byCategory,
    byType,
    topMerchants,
    largestCategory: byCategory[0] || null,
    total,
  };
}

export function Dashboard() {
  const {
    transactions,
    getMonthSummary,
    getMonthExpenseBreakdown,
    getCardExpenseBreakdown,
    getMonthComparison,
    getAvailableMonths,
    getCardMonthSnapshot,
  } = useFinance();
  const months = getAvailableMonths();
  const [selectedMonthState, setSelectedMonth] = useState(months[0] || '');
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const selectedMonth = months.includes(selectedMonthState) ? selectedMonthState : months[0] || '';

  const summary = useMemo(
    () => (selectedMonth ? getMonthSummary(selectedMonth) : null),
    [getMonthSummary, selectedMonth]
  );
  const snapshot = useMemo(
    () => (selectedMonth ? getCardMonthSnapshot(selectedMonth) : null),
    [getCardMonthSnapshot, selectedMonth]
  );
  const bankBreakdown = useMemo(
    () => (selectedMonth ? getMonthExpenseBreakdown(selectedMonth) : null),
    [getMonthExpenseBreakdown, selectedMonth]
  );
  const cardBreakdown = useMemo(
    () => (selectedMonth ? getCardExpenseBreakdown(selectedMonth) : null),
    [getCardExpenseBreakdown, selectedMonth]
  );
  const comparison = useMemo(
    () => (selectedMonth ? getMonthComparison(selectedMonth) : null),
    [getMonthComparison, selectedMonth]
  );

  const chartData = useMemo(() => {
    const subset = months.slice(0, 6).reverse();
    const years = new Set(subset.map(m => m.slice(0, 4)));
    const crossYear = years.size > 1;

    return subset.map(month => {
      const monthSummary = getMonthSummary(month);
      const label = crossYear
        ? `${getMonthLabel(month).slice(0, 3)}/${month.slice(2, 4)}`
        : getMonthLabel(month).slice(0, 3);
      return {
        month: label,
        entradas: monthSummary.totalEntradas,
        gastos: monthSummary.totalGastos,
      };
    });
  }, [getMonthSummary, months]);

  const breakdownViews = useMemo(() => {
    if (!bankBreakdown || !cardBreakdown) return [];

    if (filter === 'bank') {
      return [
        {
          id: 'bank',
          title: 'Saidas em conta',
          description: 'Debito, PIX e transferencias do mes.',
          breakdown: bankBreakdown,
        },
      ];
    }

    if (filter === 'card') {
      return [
        {
          id: 'card',
          title: 'Cartao no mes',
          description: 'So o que entrou como fatura neste periodo.',
          breakdown: cardBreakdown.invoiceBreakdown,
        },
      ];
    }

    if (filter === 'consolidated') {
      return [
        {
          id: 'consolidated',
          title: 'Visao consolidada',
          description: 'Conta + faturas do mes, sem incluir compras abertas.',
          breakdown: mergeBreakdowns([bankBreakdown, cardBreakdown.invoiceBreakdown]),
        },
      ];
    }

    return [
      {
        id: 'bank',
        title: 'Saidas em conta',
        description: 'Movimentos que sairam direto da conta neste mes.',
        breakdown: bankBreakdown,
      },
      {
        id: 'card',
        title: 'Cartao no mes',
        description: 'Faturas que realmente passaram a pesar no caixa.',
        breakdown: cardBreakdown.invoiceBreakdown,
      },
    ].filter(view => view.breakdown.total > 0);
  }, [bankBreakdown, cardBreakdown, filter]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return localStorage.getItem('financaspro_onboarding_dismissed') === '1'; } catch { return false; }
  });

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    try { localStorage.setItem('financaspro_onboarding_dismissed', '1'); } catch { /* ignore */ }
  }, []);

  if (!transactions.length && !months.length) {
    return (
      <div className="dashboard-shell p-4 sm:p-6">
        <section className="dashboard-hero animate-fade-in">
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] bg-cyan-400/10 text-cyan-200 ring-1 ring-inset ring-cyan-300/20">
              <Sparkles className="h-9 w-9" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/55">
              Painel pronto
            </p>
            <h2 className="font-display mt-4 text-xl sm:text-3xl xl:text-4xl font-semibold text-white">
              O caixa esta vazio, mas a estrutura ja esta pronta.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Importe extratos e faturas para comecar a separar conta corrente, compras de cartao e vencimentos do mes.
            </p>
          </div>
        </section>

        {!onboardingDismissed && <OnboardingCard onDismiss={dismissOnboarding} />}
      </div>
    );
  }

  const saldo = (summary?.totalEntradas || 0) - (summary?.totalGastos || 0);
  const biggestMonthCategory = filter === 'card'
    ? cardBreakdown?.invoiceBreakdown.largestCategory
    : filter === 'consolidated'
      ? mergeBreakdowns([
          bankBreakdown || { byCategory: [], byType: [], topMerchants: [], largestCategory: null, total: 0 },
          cardBreakdown?.invoiceBreakdown || { byCategory: [], byType: [], topMerchants: [], largestCategory: null, total: 0 },
        ]).largestCategory
      : bankBreakdown?.largestCategory || cardBreakdown?.invoiceBreakdown.largestCategory || null;

  return (
    <div className="dashboard-shell p-4 sm:p-6">
      <section className="dashboard-hero animate-fade-in">
        <div className="relative z-10 grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/55">
              Visao mensal
            </p>
            <h2 className="font-display mt-2 sm:mt-3 text-xl sm:text-3xl xl:text-4xl font-semibold text-white">
              {selectedMonth ? getMonthLabel(selectedMonth) : 'Sem periodo'}
            </h2>
            <p className="mt-2 sm:mt-4 max-w-2xl text-sm leading-6 sm:leading-7 text-slate-300 sm:text-base">
              As compras no cartao nao entram aqui na data da compra. Elas aparecem quando a fatura vence.
            </p>
          </div>

          <div className="dark-surface-soft rounded-[16px] sm:rounded-[24px] p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Recorte
            </p>
            <select
              value={selectedMonth}
              onChange={event => setSelectedMonth(event.target.value)}
              className="dashboard-select mt-4 w-full appearance-none rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition"
            >
              {months.map(month => (
                <option key={month} value={month}>
                  {getMonthLabel(month)}
                </option>
              ))}
            </select>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MiniMetric label="Faturas do mes" value={formatCurrency(summary?.totalFaturas || 0)} detail={`${snapshot?.invoicesToPay.length || 0} faturas`} />
              <MiniMetric label="Cartao em aberto" value={formatCurrency(summary?.totalCartaoAberto || 0)} detail={`${snapshot?.openPurchases.length || 0} compras futuras`} />
              <MiniMetric label="Saldo do mes" value={formatCurrency(saldo)} detail={saldo >= 0 ? 'caixa respirando' : 'mais saida do que entrada'} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Entradas"
          value={formatCurrency(summary?.totalEntradas || 0)}
          subtitle="Recebimentos confirmados no mes"
          icon={<ArrowUpCircle className="h-5 w-5" />}
          accent="linear-gradient(135deg, #22c55e, #14b8a6)"
        />
        <MetricCard
          label="Saidas em conta"
          value={formatCurrency((summary?.totalDebito || 0) + (summary?.totalPix || 0) + (summary?.totalTransferencia || 0))}
          subtitle="Debito, PIX e transferencias"
          icon={<ArrowDownCircle className="h-5 w-5" />}
          accent="linear-gradient(135deg, #ef4444, #fb7185)"
        />
        <MetricCard
          label="Faturas no mes"
          value={formatCurrency(summary?.totalFaturas || 0)}
          subtitle="Cartao so pesa quando vira fatura"
          icon={<CreditCard className="h-5 w-5" />}
          accent="linear-gradient(135deg, #f59e0b, #fb7185)"
        />
        <MetricCard
          label="Compras abertas"
          value={formatCurrency(snapshot?.currentOpenTotal || 0)}
          subtitle="Ainda nao contam nos gastos do periodo"
          icon={<FolderClock className="h-5 w-5" />}
          accent="linear-gradient(135deg, #22d3ee, #3b82f6)"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionShell
          eyebrow="Ultimos meses"
          title="Entradas vs gastos"
          description="Comparativo simples para enxergar a pressao no caixa depois que as faturas entram no mes certo."
        >
          <div className="h-[240px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={value => formatCurrency(Number(value || 0))}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
                  itemStyle={{ color: '#cbd5e1' }}
                />
                <Bar dataKey="entradas" fill="#22c55e" radius={[10, 10, 0, 0]} />
                <Bar dataKey="gastos" fill="#fb7185" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>

        <SectionShell
          eyebrow="Comparativo"
          title="Mes atual vs anterior"
          description="Leitura rapida para saber se o caixa apertou, melhorou ou ficou no mesmo ritmo."
        >
          <div className="grid gap-3">
            <ComparisonCard comparison={comparison} />
            <NarrativeRow
              label="Maior categoria"
              value={biggestMonthCategory?.label || 'Sem destaque'}
              hint={
                biggestMonthCategory
                  ? `${formatCurrency(biggestMonthCategory.amount)} do total no periodo`
                  : 'Sem gastos suficientes neste periodo'
              }
            />
            <NarrativeRow
              label="Faturas do mes"
              value={formatCurrency(snapshot?.totalInvoicesToPay || 0)}
              hint={`${snapshot?.invoicesToPay.length || 0} contas para pagar`}
            />
            <NarrativeRow
              label="Compras futuras"
              value={formatCurrency(snapshot?.currentOpenTotal || 0)}
              hint={`${snapshot?.openPurchases.length || 0} compras ainda fora do caixa`}
            />
          </div>
        </SectionShell>
      </section>

      <section className="dark-surface rounded-[16px] sm:rounded-[24px] p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Composicao do mes
            </p>
            <h3 className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
              Onde e como o dinheiro saiu
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Use os filtros para olhar so a conta, so o cartao ou uma leitura consolidada.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Todos
            </FilterChip>
            <FilterChip active={filter === 'bank'} onClick={() => setFilter('bank')}>
              So saidas da conta
            </FilterChip>
            <FilterChip active={filter === 'card'} onClick={() => setFilter('card')}>
              So cartao no mes
            </FilterChip>
            <FilterChip active={filter === 'consolidated'} onClick={() => setFilter('consolidated')}>
              Visao consolidada
            </FilterChip>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {breakdownViews.length ? (
            breakdownViews.map(view => (
              <BreakdownPanel
                key={view.id}
                title={view.title}
                description={view.description}
                breakdown={view.breakdown}
              />
            ))
          ) : (
            <EmptyBreakdown
              title="Sem gastos suficientes neste periodo"
              description="Importe mais movimentos ou selecione outro mes para liberar a composicao detalhada."
            />
          )}
        </div>
      </section>

      <section className="dark-surface rounded-[16px] sm:rounded-[24px] p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-100">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Faturas do mes
            </p>
            <h3 className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
              O que esta entrando no caixa atual
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {snapshot?.invoicesToPay.length ? (
            snapshot.invoicesToPay.map(invoice => (
              <div key={invoice.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{invoice.cardName}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Fecha em {formatDate(invoice.closeDate)} - vence em {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-amber-100">{formatCurrency(invoice.total)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
              Nenhuma fatura entra neste mes.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon,
  accent,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <article className="metric-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            {label}
          </p>
          <p className="mt-4 font-display text-2xl font-semibold text-cyan-100">{value}</p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-[0_16px_32px_rgba(15,23,42,0.26)]"
          style={{ background: accent }}
        >
          {icon}
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{subtitle}</p>
    </article>
  );
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="dark-surface rounded-[24px] p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
        {eyebrow}
      </p>
      <h3 className="font-display mt-2 text-2xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-400">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function NarrativeRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function ComparisonCard({
  comparison,
}: {
  comparison:
    | {
        currentTotal: number;
        previousTotal: number;
        deltaAmount: number;
        deltaPercent: number;
        direction: 'up' | 'down' | 'flat';
      }
    | null;
}) {
  const isUp = comparison?.direction === 'up';
  const isFlat = comparison?.direction === 'flat';
  const tone = isFlat ? 'text-slate-100' : isUp ? 'text-rose-200' : 'text-emerald-200';
  const Icon = isFlat ? Wallet : isUp ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Ritmo do mes
          </p>
          <p className={`mt-3 font-display text-2xl font-semibold ${tone}`}>
            {comparison ? formatCurrency(comparison.currentTotal) : formatCurrency(0)}
          </p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone} bg-white/[0.06]`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-300">
        {comparison
          ? `${comparison.deltaAmount >= 0 ? 'Variou' : 'Cedeu'} ${formatCurrency(Math.abs(comparison.deltaAmount))} (${Math.abs(comparison.deltaPercent).toFixed(1)}%) contra o mes anterior.`
          : 'Sem base suficiente para comparar este periodo.'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Mes anterior: {comparison ? formatCurrency(comparison.previousTotal) : formatCurrency(0)}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-cyan-300 text-slate-950 shadow-[0_14px_28px_rgba(34,211,238,0.18)]'
          : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
      }`}
    >
      {children}
    </button>
  );
}

function BreakdownPanel({
  title,
  description,
  breakdown,
}: {
  title: string;
  description: string;
  breakdown: ExpenseBreakdown;
}) {
  return (
    <article className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-6 text-slate-400">{description}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-cyan-100">
          {formatCurrency(breakdown.total)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <HighlightCard
          label="Maior categoria"
          value={breakdown.largestCategory?.label || 'Sem destaque'}
          hint={
            breakdown.largestCategory
              ? `${formatCurrency(breakdown.largestCategory.amount)} - ${(breakdown.largestCategory.share * 100).toFixed(0)}%`
              : 'Sem gastos suficientes neste periodo'
          }
        />
        <HighlightCard
          label="Top 3 comerciantes"
          value={breakdown.topMerchants[0]?.label || 'Sem destaque'}
          hint={
            breakdown.topMerchants.length
              ? breakdown.topMerchants.map(item => formatCurrency(item.amount)).join(' | ')
              : 'Sem dados suficientes'
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownList title="Onde gastei" items={breakdown.byCategory} emptyMessage="Sem categorias neste periodo." />
        <BreakdownList title="Como gastei" items={breakdown.byType} emptyMessage="Sem tipos neste periodo." />
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Top comerciantes
        </p>
        <div className="mt-3 grid gap-2">
          {breakdown.topMerchants.length ? (
            breakdown.topMerchants.map(item => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/30 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.count} lancamento{item.count !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-semibold text-cyan-100">{formatCurrency(item.amount)}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/20 px-3 py-4 text-sm text-slate-400">
              Sem dados suficientes para destacar comerciantes.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function BreakdownList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: ExpenseBreakdownItem[];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-slate-950/22 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2.5">
        {items.length ? (
          items.slice(0, 6).map(item => (
            <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.count} lancamento{item.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-cyan-100">{formatCurrency(item.amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">{(item.share * 100).toFixed(0)}%</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-400" style={{ width: `${Math.max(item.share * 100, 6)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-400">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyBreakdown({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="xl:col-span-2 rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function OnboardingCard({ onDismiss }: { onDismiss: () => void }) {
  const steps = [
    { icon: Upload, title: 'Importe seus extratos', desc: 'CSV, OFX ou PDF do seu banco ou cartao.' },
    { icon: Wand2, title: 'Revise as categorias', desc: 'O app categoriza automaticamente. Ajuste as regras.' },
    { icon: BarChart3, title: 'Acompanhe o mes', desc: 'Veja entradas, saidas, faturas e compras abertas.' },
  ];

  return (
    <section className="dark-surface animate-fade-in mt-4 rounded-[24px] p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
            Primeiros passos
          </p>
          <h3 className="font-display mt-2 text-xl font-semibold text-white">
            Como comecar
          </h3>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shell-icon-button h-8 w-8 rounded-lg"
          title="Dispensar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200">
              <step.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-100">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
